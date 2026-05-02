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
import { localToolsService } from '../local-tools';
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

function shouldUseGatewayAgent(): boolean {
  const value = process.env.SARAH_OPENCLAW_GATEWAY_AGENT;
  if (!value) return true;
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function resolveGatewayPromptMode(): 'full' | 'minimal' | 'none' {
  const value = process.env.SARAH_OPENCLAW_PROMPT_MODE;
  if (value === 'full' || value === 'none') return value;
  return 'minimal';
}

function resolveGatewayBootstrapMode(): 'full' | 'lightweight' {
  return process.env.SARAH_OPENCLAW_BOOTSTRAP_MODE === 'full' ? 'full' : 'lightweight';
}

function resolveOpenClawAgentId(): string {
  return process.env.SARAH_OPENCLAW_AGENT_ID?.trim() || 'main';
}

function resolveOpenClawModel(): string | null {
  return process.env.SARAH_OPENCLAW_MODEL?.trim() || null;
}

function buildGatewayAgentParams(params: {
  prompt: string;
  sessionId: string;
  runId: string;
}): string {
  const model = resolveOpenClawModel();
  return JSON.stringify({
    message: params.prompt,
    agentId: resolveOpenClawAgentId(),
    idempotencyKey: params.runId,
    sessionId: params.sessionId,
    thinking: process.env.SARAH_OPENCLAW_THINKING?.trim() || 'off',
    timeout: Number(process.env.SARAH_OPENCLAW_TIMEOUT_SECONDS ?? 120),
    promptMode: resolveGatewayPromptMode(),
    bootstrapContextMode: resolveGatewayBootstrapMode(),
    bootstrapContextRunKind: 'default',
    modelRun: true,
    cleanupBundleMcpOnRunEnd: true,
    ...(model ? { model } : {}),
  });
}

// ─── AgentService ─────────────────────────────────────────────────────────────

export class AgentService extends EventEmitter {
  private proc: ReturnType<typeof spawn> | null = null;
  private running = false;
  private runVersion = 0;
  private activeRunId: string | null = null;

  /** Queue for tasks submitted while another is running. */
  private pendingExecution: { instruction: string; context: AgentContext; resolve: () => void } | null = null;

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
      logger.info('AgentService: task already running, queuing new request');
      return new Promise<void>((resolve) => {
        this.pendingExecution = { instruction, context, resolve };
      });
    }

    this.running = true;
    const runVersion = ++this.runVersion;
    logger.info('AgentService.execute', {
      instruction: instruction.slice(0, 80),
      app: context.appName,
    });

    const memory = memoryService.load();
    const localToolsSummary = await localToolsService
      .getAgentContextSummary()
      .catch((error) => {
        logger.warn('Failed to build local tools summary', {
          error: error instanceof Error ? error.message : String(error),
        });
        return 'Local tool detection unavailable.';
      });

    return new Promise<void>((resolve) => {
      const tSpawn = Date.now();
      const useGatewayAgent = shouldUseGatewayAgent();
      const prompt = useGatewayAgent
        ? this.buildGatewayPrompt(instruction, context, memory, localToolsSummary)
        : this.buildPrompt(instruction, context, memory, localToolsSummary);
      const runId = `sarah-${process.pid}-${Date.now().toString(36)}-${runVersion}`;
      this.activeRunId = runId;
      const gatewayParams = buildGatewayAgentParams({
        prompt,
        sessionId: this.sessionId,
        runId,
      });
      const proc = spawn(
        this.openclawBin,
        useGatewayAgent
          ? [
              'gateway',
              'call',
              'agent',
              '--expect-final',
              '--json',
              '--timeout', String(Number(process.env.SARAH_OPENCLAW_GATEWAY_TIMEOUT_MS ?? 180_000)),
              '--params', gatewayParams,
            ]
          : [
              'agent',
              '--agent', resolveOpenClawAgentId(),
              '--json',
              '--thinking', process.env.SARAH_OPENCLAW_THINKING?.trim() || 'off',
              '--session-id', this.sessionId,
              '--message', prompt,
              ...(resolveOpenClawModel() ? ['--model', resolveOpenClawModel() as string] : []),
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
      let tFirstStdout = 0;
      let tFirstStderr = 0;

      proc.stdout.on('data', (chunk: Buffer) => {
        if (tFirstStdout === 0) tFirstStdout = Date.now();
        stdoutBuf += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        if (tFirstStderr === 0) tFirstStderr = Date.now();
        const data = chunk.toString();
        stderrBuf += data;
        logger.debug('openclaw stderr', { data: data.slice(0, 300) });
      });

      proc.on('close', (code) => {
        void (async () => {
          const tClose = Date.now();
          if (runVersion !== this.runVersion) {
            resolve();
            return;
          }

          this.running = false;
          this.proc = null;
          if (this.activeRunId === runId) {
            this.activeRunId = null;
          }
          const parsed = parseOpenClawResponse(stdoutBuf);
          logger.info('openclaw-timing', {
            transport: useGatewayAgent ? 'gateway-call' : 'agent-cli',
            spawn_to_first_stderr_ms: tFirstStderr ? tFirstStderr - tSpawn : null,
            spawn_to_first_stdout_ms: tFirstStdout ? tFirstStdout - tSpawn : null,
            spawn_to_close_ms: tClose - tSpawn,
            stdout_bytes: stdoutBuf.length,
            stderr_bytes: stderrBuf.length,
            exit_code: code,
            parsed_chars: parsed?.text?.length ?? 0,
          });

          if (code === 0 || code === null) {
            if (parsed?.text) {
              fullResponse = parsed.text;
              await this.emitVisibleText(runVersion, parsed.text);
            }
            memoryService.appendAction(instruction, fullResponse);
            if (fullResponse.trim()) {
              memoryService.appendTurn(instruction, fullResponse);
            }
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
          this.drainQueue();
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
        if (this.activeRunId === runId) {
          this.activeRunId = null;
        }
        logger.error('Failed to spawn openclaw', { code: err.code, bin: this.openclawBin });
        const message =
          err.code === 'ENOENT'
            ? `openclaw CLI 未找到 (尝试路径: ${this.openclawBin})。请先安装并确认 \`openclaw\` 命令可用。`
            : `无法启动 openclaw CLI: ${err.message}`;
        this.emit('error', message);
        this.drainQueue();
        resolve();
      });
    });
  }

  /**
   * Kill the current OpenClaw process.
   * @param emitDone - whether to emit 'done'. Pass `false` when calling from
   *   execute() so the UI does not flash "已完成" before the new run starts.
   */
  abort(emitDone = true): void {
    // Clear any queued task so it doesn't run after abort.
    if (this.pendingExecution) {
      this.pendingExecution.resolve();
      this.pendingExecution = null;
    }

    if (!this.running && !this.proc) {
      if (emitDone) {
        this.emit('done');
      }
      return;
    }

    this.runVersion += 1;
    const runId = this.activeRunId;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    if (runId && shouldUseGatewayAgent()) {
      this.abortGatewayRun(runId);
    }
    this.activeRunId = null;
    this.running = false;
    if (emitDone) {
      this.emit('done');
    }
    logger.info('AgentService: aborted');
  }

  private abortGatewayRun(runId: string): void {
    const sessionKey = `agent:${resolveOpenClawAgentId()}:explicit:${this.sessionId}`;
    const params = JSON.stringify({ key: sessionKey, runId });
    const proc = spawn(
      this.openclawBin,
      ['gateway', 'call', 'sessions.abort', '--json', '--timeout', '5000', '--params', params],
      {
        env: { ...process.env, PATH: this.enhancedPath },
        shell: false,
        stdio: 'ignore',
        detached: true,
      },
    );
    proc.unref();
  }

  /** Run the next queued task if one exists. Called after each task completes. */
  private drainQueue(): void {
    const pending = this.pendingExecution;
    if (!pending) return;
    this.pendingExecution = null;
    logger.info('AgentService: draining queued task', {
      instruction: pending.instruction.slice(0, 80),
    });
    // Fire and forget — the queued caller's promise resolves when this run ends.
    void this.execute(pending.instruction, pending.context).then(() => pending.resolve());
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ─── Prompt ────────────────────────────────────────────────────────────────

  private buildGatewayPrompt(
    instruction: string,
    context: AgentContext,
    memory: AgentMemory,
    localToolsSummary: string,
  ): string {
    const recentActionsStr =
      memory.recent_actions.length > 0
        ? memory.recent_actions
            .slice(0, 3)
            .map((a) => `- ${a.instruction}`)
            .join('\n')
        : '无';

    const screenContext = [
      `应用：${context.appName || '未知'}`,
      context.windowTitle ? `窗口：${context.windowTitle}` : '',
      context.url ? `URL：${context.url}` : '',
      context.screenshotPath ? `截图：${context.screenshotPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contextHint = context.url || context.screenshotPath
      ? '如果任务依赖当前屏幕，请优先使用上面的 URL 或截图路径。'
      : '当前没有 URL 或截图；如果用户指代“这个页面/当前内容”，请要求用户补充 URL 或正文。';

    return `你是 Sarah 的快速桌面助手。请用中文直接回答，优先简洁。

当前屏幕上下文：
${screenContext}

上下文原则：
${contextHint}

最近 Sarah 操作：
${recentActionsStr}

本机 Local Tools：
${localToolsSummary}

用户请求：
${instruction}`;
  }

  private buildPrompt(
    instruction: string,
    context: AgentContext,
    memory: AgentMemory,
    localToolsSummary: string,
  ): string {
    const prefs = JSON.stringify(memory.preferences, null, 2);

    const recentActionsStr =
      memory.recent_actions.length > 0
        ? memory.recent_actions
            .slice(0, 5)
            .map((a) => `• ${a.instruction}`)
            .join('\n')
        : '（无）';

    const screenContext = [
      `应用：${context.appName}`,
      context.windowTitle ? `窗口：${context.windowTitle}` : '',
      context.url ? `URL：${context.url}` : '',
      context.screenshotPath ? `截图路径：${context.screenshotPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Tell the agent honestly what page-level context is available, so it
    // does not invent a “current page content” it never received.
    const hasUrl = !!context.url;
    const hasScreenshot = !!context.screenshotPath;
    const contextLimitations: string[] = [];
    if (!hasUrl && !hasScreenshot) {
      contextLimitations.push(
        '- 当用户说”当前页/这个页面/这篇文章”等指代式说法时，你没有任何页面内容。请明确告诉用户：需要他粘贴 URL 或正文，否则你无法处理。',
      );
    } else if (!hasUrl && hasScreenshot) {
      contextLimitations.push(
        '- 当前没有 URL，但有截图可用。用户说”当前页面/这个页面”时，直接分析截图内容来完成任务。不要要求用户提供 URL。',
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
- web-access：通过 CDP 连接用户正在运行的 Chrome 浏览器，可访问已登录的网站（X/Twitter、GitHub、小红书等）。触发场景：
  • 用户提到”这个网页/这篇文章/这个链接/当前页面”时优先用
  • 用户说”保存到飞书/记录到飞书”且当前应用是浏览器时，先用 web-access 抽取当前页面内容
  • 用户说”去 XX 网站搜索/看看/找一下”——无论当前在什么应用，都可以用 web-access 打开浏览器操作
  • 注意：如果当前应用是飞书（appName 包含 “Lark” 或 “Feishu”），不需要 web-access，直接用 lark-doc/lark-im 等工具
- agent-browser：需要复杂交互式浏览时使用（web-access 无法完成时升级使用）
- lark-base / feishu-bitable：飞书多维表格读写（”加到飞书表格 / 多维表格 / bitable”）
- lark-doc / feishu-create-doc / feishu-fetch-doc：飞书文档创建与读取
- lark-im：飞书 IM 发消息
- lark-task：飞书任务
- lark-sheets：飞书电子表格

═══ 场景决策树 ═══
1. “保存/记录到飞书”类指令：
   - 应用名包含 Lark/Feishu/飞书 → 直接用 lark-doc 或 lark-im
   - 应用名是浏览器（Chrome/Safari/Edge）→ web-access 抽取当前页面 → lark-doc/lark-im 写入
   - 其他任何应用（CodePilot、微信、备忘录等）→ 直接分析截图内容 → 提取文字 → 写入飞书
2. “去 XX 网站搜索/看看/找一下”类指令：
   - 不管当前在什么应用，直接用 web-access 打开浏览器操作
   - web-access 通过 CDP 连接用户已打开的 Chrome，保留登录态（X、GitHub 等无需重新登录）
3. web-access 抽取时，优先使用「当前屏幕上下文」中的 URL
4. 有截图但没有 URL 时 → 分析截图内容，不要要求用户提供 URL
5. 只有当既没有 URL 也没有截图时，才要求用户提供内容

═══ 链式调用示例 ═══
- “把这个网页内容加到飞书多维表格”（当前在 Chrome）：web-access 抽取 → feishu-bitable 写入
- “保存当前页面到飞书文档”（当前在 Safari）：web-access 抽取 → lark-doc 创建文档
- “去 X 上搜一下最新的 AI 动态”：web-access 打开 X → 搜索 → 抽取结果
- “去 GitHub 看看这个项目的 issues”：web-access 打开 GitHub → 浏览 → 抽取内容
- “总结这篇文章并发到飞书群”：web-access 抽取 → 总结 → lark-im 发送
- “把这条飞书消息转成文档”（当前在飞书）：直接用 lark-doc 创建 → 写入内容
- “创建飞书文档记录这次讨论”：feishu-create-doc 创建 → 写入内容
- “把当前页面记录到飞书”（当前在 CodePilot/任意非浏览器应用）→ 分析截图内容 → 提取文字 → lark-doc 创建文档

═══ 特殊情况：appName 是 CodePilot ═══
当「应用」显示为 CodePilot 时，说明用户在 CodePilot 界面内按下了热键。
截图捕获的是用户按下热键那一刻的屏幕内容（可能是 CodePilot 下方的其他窗口）。
- 如果有截图 → 直接分析截图中的可见内容来完成任务
- 不要因为 appName 是 CodePilot 就拒绝执行或要求用户提供 URL

═══ 本机 Local Tools（检测结果，不代表自动授权） ═══
${localToolsSummary}

═══ 当前屏幕上下文 ═══
${screenContext}
${limitationsBlock}
═══ 用户偏好 ═══
${prefs}

═══ 最近操作 ═══
${recentActionsStr}

═══ 任务 ═══
${instruction}

注意：回复使用中文，简洁直接。能用 skill 就别手写 shell；多步任务先列计划再执行；完成后给一句话总结。
关键：根据「当前屏幕上下文」自动判断当前应用类型，选择最合适的 skill。不要假设用户在什么应用里——看上下文里的「应用」字段。`;
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
