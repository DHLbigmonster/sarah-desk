/**
 * Agent Service.
 * Spawns the `openclaw` CLI as a subprocess and returns its response.
 *
 * At first execute() call the service resolves the absolute path of the
 * `openclaw` binary (and optionally `lark`) by probing common installation
 * directories.  This handles environments where Electron is launched from
 * the Dock and does not inherit the user's shell PATH.
 */

import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import log from 'electron-log';
import { memoryService } from './memory.service';
import { intentRouter, logIntentDecision } from './intent-router.service';
import { lightweightRefinementClient } from './lightweight-refinement-client';
import type { AgentContext } from '../../../shared/types/agent';
import type { AgentMemory } from './memory.service';

const logger = log.scope('agent-service');

// ─── Binary resolution ────────────────────────────────────────────────────────

/**
 * Directories to probe when a binary is not on the inherited PATH.
 * Listed in priority order.
 */
const EXTRA_BIN_DIRS: string[] = [
  '/opt/node22/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/opt/node/bin',
  `${os.homedir()}/.local/bin`,
  `${os.homedir()}/.volta/bin`,
  `${os.homedir()}/.bun/bin`,
];

/**
 * Resolve an absolute path for a CLI binary.
 *
 * Strategy:
 *   1. `which <name>` — already on PATH
 *   2. Probe EXTRA_BIN_DIRS
 *   3. Probe each version under ~/.nvm/versions/node/<ver>/bin (newest first)
 *
 * Returns the absolute path, or the bare name as fallback (will ENOENT).
 */
function resolveBinary(name: string): string {
  // 1. `which`
  try {
    const found = execFileSync('which', [name], { encoding: 'utf-8', timeout: 3000 }).trim();
    if (found) return found;
  } catch { /* not on PATH */ }

  // 2. Extra dirs
  for (const dir of EXTRA_BIN_DIRS) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }

  // 3. nvm
  const nvmRoot = path.join(os.homedir(), '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmRoot)) {
    const versions = fs.readdirSync(nvmRoot).sort().reverse();
    for (const ver of versions) {
      const full = path.join(nvmRoot, ver, 'bin', name);
      if (fs.existsSync(full)) return full;
    }
  }

  return name; // fallback – ENOENT at spawn time
}

/**
 * Build an enhanced PATH string that includes the directory of a resolved
 * binary plus common extra dirs.  This ensures that when openclaw itself
 * spawns subprocesses (node, npx, …) they can be found.
 */
function buildEnhancedPath(resolvedBinaryPath: string): string {
  const parts = new Set<string>([
    path.dirname(resolvedBinaryPath),
    ...(process.env.PATH ?? '').split(':').filter(Boolean),
    ...EXTRA_BIN_DIRS,
  ]);
  return [...parts].join(':');
}

// ─── OpenClaw helpers ─────────────────────────────────────────────────────────

/**
 * Parse JSON emitted by `openclaw agent --json`.
 */
function parseOpenClawResponse(raw: string): { text: string; meta?: Record<string, unknown> } | null {
  try {
    const obj = JSON.parse(raw) as {
      result?: {
        payloads?: Array<{ text?: string | null }>;
        finalAssistantVisibleText?: string;
        meta?: Record<string, unknown>;
      };
    };

    const visibleText = obj.result?.finalAssistantVisibleText?.trim();
    if (visibleText) {
      return { text: visibleText, meta: obj.result?.meta };
    }

    const payloadText = (obj.result?.payloads ?? [])
      .map((payload) => payload.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join('\n\n');

    return payloadText ? { text: payloadText, meta: obj.result?.meta } : null;
  } catch {
    return null;
  }
}

function sanitizeOpenClawError(stderr: string): string {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('Invalid config at '))
    .filter((line) => !line.startsWith('- plugins.entries.'))
    .join('\n');
}

// ─── AgentService ─────────────────────────────────────────────────────────────

export class AgentService extends EventEmitter {
  private proc: ReturnType<typeof spawn> | null = null;
  private running = false;
  private runVersion = 0;

  /** Resolved absolute paths (lazy, set on first execute) */
  private openclawBin = 'openclaw';
  private larkBin: string | null = null;
  private enhancedPath = process.env.PATH ?? '';
  private initialized = false;

  /** Stable session id reused across calls within this app instance to keep agent context warm. */
  private readonly sessionId = `sarah-${process.pid}-${Date.now().toString(36)}`;

  /** Resolve binaries once. */
  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.openclawBin = resolveBinary('openclaw');
    this.enhancedPath = buildEnhancedPath(this.openclawBin);

    const lark = resolveBinary('lark');
    this.larkBin = lark !== 'lark' ? lark : null;

    logger.info('AgentService initialized', {
      openclawBin: this.openclawBin,
      larkBin: this.larkBin ?? '(not found)',
    });
  }

  async execute(instruction: string, context: AgentContext): Promise<void> {
    this.initialize();

    if (this.running) {
      logger.warn('AgentService: aborting previous run');
      this.abort();
    }

    this.running = true;
    const runVersion = ++this.runVersion;
    logger.info('AgentService.execute', {
      instruction: instruction.slice(0, 80),
      app: context.appName,
    });

    const decision = intentRouter.classify(instruction);
    logIntentDecision(instruction, decision);

    if (decision.tier === 't1' && lightweightRefinementClient.isConfigured()) {
      const handled = await this.runQuickAnswer(runVersion, instruction);
      if (runVersion !== this.runVersion) {
        return;
      }
      if (handled) {
        this.running = false;
        return;
      }
      logger.info('Quick answer fallback to agent', { reason: 't1-failed' });
    }

    const memory = memoryService.load();
    const prompt = this.buildPrompt(instruction, context, memory);

    return new Promise<void>((resolve) => {
      const proc = spawn(
        this.openclawBin,
        [
          'agent',
          '--agent', 'main',
          '--json',
          '--thinking', 'minimal',
          '--session-id', this.sessionId,
          '--message', prompt,
        ],
        {
          env: { ...process.env, PATH: this.enhancedPath },
          shell: false,
        },
      );

      this.proc = proc;
      let fullResponse = '';
      let stdoutBuf = '';
      let stderrBuf = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        stderrBuf += data;
        logger.debug('openclaw stderr', { data: data.slice(0, 300) });
      });

      proc.on('close', (code) => {
        void (async () => {
          if (runVersion !== this.runVersion) {
            resolve();
            return;
          }

          this.running = false;
          this.proc = null;
          const parsed = parseOpenClawResponse(stdoutBuf);

          if (code === 0 || code === null) {
            if (parsed?.text) {
              fullResponse = parsed.text;
              await this.emitVisibleText(runVersion, parsed.text);
            }
            memoryService.appendAction(instruction, fullResponse);
            if (runVersion === this.runVersion) {
              this.emit('done');
            }
          } else {
            const cleanedError = sanitizeOpenClawError(stderrBuf);
            logger.warn('openclaw exited non-zero', { code, stderr: cleanedError.slice(0, 400) });
            const isAuthError =
              cleanedError.includes('auth') ||
              cleanedError.includes('login') ||
              cleanedError.includes('API key') ||
              cleanedError.includes('401') ||
              cleanedError.includes('403');
            const message = isAuthError
              ? 'OpenClaw 未登录或鉴权失败。请先在终端确认 `openclaw agent --agent main --message "test" --json` 可用。'
              : `OpenClaw 退出，代码 ${code}。\n可先点击右上角“自检”重试；如仍失败，再在终端运行 \`openclaw agent --agent main --message "test" --json\`。\n${cleanedError.slice(0, 200)}`;
            if (runVersion === this.runVersion) {
              this.emit('error', message);
            }
          }
          resolve();
        })();
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (runVersion !== this.runVersion) {
          resolve();
          return;
        }
        this.running = false;
        this.proc = null;
        logger.error('Failed to spawn openclaw', { code: err.code, bin: this.openclawBin });
        const message =
          err.code === 'ENOENT'
            ? `openclaw CLI 未找到 (尝试路径: ${this.openclawBin})。请先安装并确认 \`openclaw\` 命令可用。`
            : `无法启动 openclaw CLI: ${err.message}`;
        this.emit('error', message);
        resolve();
      });
    });
  }

  abort(): void {
    if (!this.running && !this.proc) {
      return;
    }

    this.runVersion += 1;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.running = false;
    this.emit('done');
    logger.info('AgentService: aborted');
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ─── T1 Quick Answer ────────────────────────────────────────────────────────

  /**
   * Quick answer path: bypass OpenClaw, ask the Ark lightweight model directly.
   * Returns true if the answer was emitted; false if the caller should fall
   * back to the full agent path.
   */
  private async runQuickAnswer(runVersion: number, instruction: string): Promise<boolean> {
    try {
      const answer = await lightweightRefinementClient.refine({
        systemPrompt:
          '你是用户的中文助手。用户的问题不涉及网页、文件、命令、飞书等外部工具，' +
          '请直接、简洁、准确地回答。' +
          '回答风格：1) 中文；2) 不超过 4 句话或 80 个字；3) 不需要的客套与免责声明全部省略；' +
          '4) 如果问题确实需要外部工具或多步操作才能回答，仅返回一个英文 token：NEED_AGENT。',
        userPrompt: instruction,
      });
      const text = answer?.trim();

      if (!text || text === 'NEED_AGENT' || /^NEED[_\s]?AGENT$/i.test(text)) {
        logger.info('Quick answer declined by model', { reason: text || 'empty' });
        return false;
      }

      if (runVersion !== this.runVersion) {
        return true;
      }

      await this.emitVisibleText(runVersion, text);
      memoryService.appendAction(instruction, text);

      if (runVersion === this.runVersion) {
        this.emit('done');
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Quick answer failed', { message: message.slice(0, 200) });
      return false;
    }
  }

  // ─── Prompt ────────────────────────────────────────────────────────────────

  private buildPrompt(instruction: string, context: AgentContext, memory: AgentMemory): string {
    const prefs = JSON.stringify(memory.preferences, null, 2);

    const recentActionsStr =
      memory.recent_actions.length > 0
        ? memory.recent_actions
            .slice(0, 5)
            .map((a) => `• ${a.instruction}`)
            .join('\n')
        : '（无）';

    const larkNote = this.larkBin
      ? `lark CLI 路径：${this.larkBin}`
      : '（lark CLI 未检测到，请先安装飞书命令行工具）';

    const screenContext = [
      `应用：${context.appName}`,
      context.windowTitle ? `窗口：${context.windowTitle}` : '',
      context.url ? `URL：${context.url}` : '',
      context.screenshotPath ? `截图路径：${context.screenshotPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Tell the agent honestly what page-level context is available, so it
    // does not invent a "current page content" it never received.
    const hasUrl = !!context.url;
    const hasScreenshot = !!context.screenshotPath;
    const contextLimitations: string[] = [];
    if (!hasUrl) {
      contextLimitations.push(
        '- 当前应用不是浏览器（或未识别），没有抽到 URL，因此 web-access 没有可访问的链接。',
      );
    }
    if (!hasScreenshot) {
      contextLimitations.push(
        '- 没有屏幕截图（缺屏幕录制权限或截图失败），无法基于截图分析页面。',
      );
    }
    if (!hasUrl && !hasScreenshot) {
      contextLimitations.push(
        '- 当用户说”当前页/这个页面/这篇文章“等指代式说法时，你没有任何页面正文。请明确告诉用户：需要他粘贴 URL 或正文，否则你无法处理。',
      );
    }
    const limitationsBlock = contextLimitations.length
      ? `\n═══ 当前上下文限制（必读） ═══\n${contextLimitations.join('\n')}\n`
      : '';

    return `你是用户的 macOS 桌面 AI 助手。优先使用已就绪的 skills，必要时再用通用工具。

═══ 通用工具 ═══
- Bash：运行 shell 命令（包括 lark CLI）
- WebFetch / WebSearch：获取网页 / 搜索
- Read / Write：本地文件读写

═══ 已就绪 Skills（按触发场景使用，组合调用） ═══
- web-access：访问、解析、抽取网页内容（用户提到”这个网页/这篇文章/这个链接“时优先用）
- agent-browser：需要登录态或交互式浏览时使用
- lark-base / feishu-bitable：飞书多维表格读写（”加到飞书表格 / 多维表格 / bitable“）
- lark-doc / feishu-create-doc / feishu-fetch-doc：飞书文档创建与读取
- lark-im：飞书 IM 发消息
- lark-task：飞书任务
- lark-sheets：飞书电子表格

═══ 链式调用示例 ═══
- ”把这个网页内容加到飞书多维表格“：web-access 抽取 → feishu-bitable 写入
- ”总结这篇文章并发到飞书群“：web-access 抽取 → 总结 → lark-im 发送
- ”创建飞书文档记录这次讨论“：feishu-create-doc 创建 → 写入内容

═══ 工具路径 ═══
${larkNote}

═══ 当前屏幕上下文 ═══
${screenContext}
${limitationsBlock}
═══ 用户偏好 ═══
${prefs}

═══ 最近操作 ═══
${recentActionsStr}

═══ 任务 ═══
${instruction}

注意：回复使用中文，简洁直接。能用 skill 就别手写 shell；多步任务先列计划再执行；完成后给一句话总结。`;
  }

  private async emitVisibleText(runVersion: number, text: string): Promise<void> {
    const chunks = this.chunkVisibleText(text);
    for (let index = 0; index < chunks.length; index += 1) {
      if (runVersion !== this.runVersion) {
        return;
      }
      this.emit('chunk', { type: 'text', text: chunks[index] });
      if (index < chunks.length - 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.resolveChunkDelay(chunks[index]));
        });
      }
    }
  }

  private chunkVisibleText(text: string): string[] {
    const chunks: string[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      const slice = text.slice(cursor);
      const punctMatch = slice.match(/^.{1,36}?(?:[，。！？；：,.!?;\n]|$)/u);
      const rawChunk = punctMatch?.[0] ?? slice.slice(0, 24);
      const chunk = rawChunk.length > 0 ? rawChunk : slice.slice(0, 1);
      chunks.push(chunk);
      cursor += chunk.length;
    }

    return chunks.filter(Boolean);
  }

  private resolveChunkDelay(chunk: string): number {
    const trimmed = chunk.trim();
    if (!trimmed) return 10;
    if (trimmed.length <= 6) return 18;
    if (trimmed.length <= 20) return 26;
    return 34;
  }
}

export const agentService = new AgentService();
