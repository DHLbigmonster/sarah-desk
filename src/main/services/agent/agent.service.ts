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
import { clawDeskSettingsService } from '../clawdesk/settings.service';
import { abortOpenClawGatewayRun, runOpenClawGatewayAgent } from './openclaw-gateway-client';
import type { AgentContext } from '../../../shared/types/agent';
import type { AgentRuntimeId } from '../../../shared/types/clawdesk-settings';
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

function parseHermesResponse(raw: string): { text: string } | null {
  const text = raw.trim();
  return text ? { text } : null;
}

function parsePlainTextResponse(raw: string): { text: string } | null {
  const text = raw.trim();
  return text ? { text } : null;
}

function parseCodexJsonLine(line: string): { text?: string; progress?: string; toolName?: string } | null {
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const method = typeof obj.method === 'string' ? obj.method : typeof obj.type === 'string' ? obj.type : '';
    const params = typeof obj.params === 'object' && obj.params !== null ? obj.params as Record<string, unknown> : {};
    const topLevelItem = typeof obj.item === 'object' && obj.item !== null ? obj.item as Record<string, unknown> : null;
    const paramItem = typeof params.item === 'object' && params.item !== null ? params.item as Record<string, unknown> : null;
    const item = topLevelItem ?? paramItem ?? {};
    const message = typeof params.message === 'string' ? params.message : '';

    if (method.includes('message') && message) {
      return { text: message };
    }
    if (method.includes('item/started') || method.includes('item.started')) {
      const itemType = String(item.type ?? item.item_type ?? 'tool');
      const command = typeof item.command === 'string' ? item.command : '';
      return { progress: command ? `Running ${command}` : `Using ${itemType}`, toolName: 'Codex' };
    }
    if (method.includes('item/completed') || method.includes('item.completed')) {
      const itemType = String(item.type ?? item.item_type ?? '');
      const text = typeof item.text === 'string' ? item.text : '';
      if (itemType === 'agent_message' && text) {
        return { text };
      }
      const output = typeof item.aggregated_output === 'string' ? item.aggregated_output.trim() : '';
      if (output) return { progress: output.slice(0, 160), toolName: 'Codex' };
      return { progress: 'Completed a Codex step', toolName: 'Codex' };
    }
    return null;
  } catch {
    return null;
  }
}

function parseClaudeStreamJsonLine(line: string): { text?: string; progress?: string; toolName?: string; final?: boolean } | null {
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : '';
    const event = typeof obj.event === 'object' && obj.event !== null ? obj.event as Record<string, unknown> : null;
    const eventType = typeof event?.type === 'string' ? event.type : '';

    if (type === 'assistant') {
      // The final assistant object repeats the streamed deltas; ignore it here
      // and rely on the final result event for non-streaming fallback.
      return null;
    }

    if (type === 'content_block_delta' || eventType === 'content_block_delta') {
      const source = event ?? obj;
      const delta = typeof source.delta === 'object' && source.delta !== null ? source.delta as Record<string, unknown> : {};
      const text = typeof delta.text === 'string' ? delta.text : '';
      return text ? { text } : null;
    }

    if (type === 'tool_use' || type === 'tool_result' || eventType === 'tool_use' || eventType === 'tool_result') {
      const source = event ?? obj;
      const name = typeof source.name === 'string' ? source.name : 'Claude Code';
      const isToolUse = type === 'tool_use' || eventType === 'tool_use';
      return { progress: isToolUse ? `Using ${name}` : `Finished ${name}`, toolName: name };
    }

    if (type === 'result') {
      const text = typeof obj.result === 'string' ? obj.result : '';
      return text ? { text, final: true } : { final: true };
    }

    return null;
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

function sanitizeHermesError(stderr: string): string {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join('\n');
}

function shouldUseGatewayAgent(): boolean {
  const value = process.env.SARAH_OPENCLAW_GATEWAY_AGENT;
  if (!value) return true;
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function shouldUseOpenClawWebSocketAgent(): boolean {
  const value = process.env.SARAH_OPENCLAW_WS_AGENT;
  if (!value) return true;
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function shouldEnableHermesBrowserAutomation(instruction: string): boolean {
  return /点击|打开|填写|登录|滚动|翻页|操作(一下)?(浏览器|网页|页面|Chrome|Safari)?|控制(浏览器|网页|Chrome|Safari)|browser|chrome|safari|click|fill|login|scroll/i.test(instruction);
}

function resolveHermesToolsets(instruction: string): string {
  const configured = process.env.SARAH_HERMES_TOOLSETS?.trim();
  if (configured) return configured;
  const fastToolsets = ['web', 'terminal', 'file', 'vision', 'skills', 'todo', 'messaging'];
  if (shouldEnableHermesBrowserAutomation(instruction)) {
    fastToolsets.splice(1, 0, 'browser');
  }
  if (shouldEnableHermesComputerUse(instruction) && isHermesComputerUseAvailable()) {
    fastToolsets.splice(1, 0, 'computer_use');
  }
  return fastToolsets.join(',');
}

function shouldEnableHermesComputerUse(instruction: string): boolean {
  return /当前屏幕|当前窗口|这个应用|Telegram|微信|飞书|Lark|Finder|Figma|PDF|截图|点击|滚动|输入|拖拽|操作一下|computer use|computer-use|gui|desktop|screen/i.test(instruction);
}

function isHermesComputerUseAvailable(): boolean {
  const override = process.env.HERMES_CUA_DRIVER_CMD?.trim();
  if (override && fs.existsSync(override)) return true;
  return resolveBinary('cua-driver') !== 'cua-driver';
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

const WEB_CONTEXT_KEYWORDS = ['chrome', 'safari', 'firefox', 'brave', 'edge', 'chromium', 'opera', 'arc'];

function isWebContext(context: AgentContext): boolean {
  if (context.url) return true;
  const appName = context.appName.toLowerCase();
  return WEB_CONTEXT_KEYWORDS.some((keyword) => appName.includes(keyword));
}

function isSarahSurfaceContext(context: AgentContext): boolean {
  const appName = context.appName.toLowerCase();
  return appName.includes('sarah') || appName.includes('open-typeless');
}

function buildContextAcquisitionPolicy(context: AgentContext): string {
  const hasUrl = !!context.url;
  const hasScreenshot = !!context.screenshotPath;
  const webContext = isWebContext(context);
  const sarahSurface = isSarahSurfaceContext(context);

  const lines = [
    '上下文获取策略（必须按顺序执行，不要把截图/打开网页的责任推给用户）：',
    '1. 如果当前上下文有 URL：优先用 web-access / browser 工具读取该 URL 或当前浏览器页面；如果读取失败，再用截图路径分析可见内容。',
    '2. 如果当前应用是浏览器但没有 URL：先尝试 web-access 连接当前浏览器/当前标签页；如果失败，再用截图路径分析。',
    '3. 如果当前是非网页应用：直接使用截图路径分析屏幕可见内容，然后再思考和执行。',
    '4. 只有在既没有 URL、也没有截图路径、也无法访问浏览器时，才向用户索要内容。',
    '5. 保存到飞书/Obsidian/文件等写入动作，如果需要授权，只请求“写入授权/目标位置确认”，不要要求用户自己截图或复制页面内容。',
    '6. 需要网页内容时优先使用页面读取/API/文本抽取；只有必须点击、登录、翻页或操作页面时才使用慢速浏览器自动化。',
  ];

  if (sarahSurface) {
    lines.push(
      '注意：appName 显示为 Sarah 时通常是 Sarah 自己的浮层/状态窗，不应把 Sarah UI 当作用户目标内容；优先使用截图中的非 Sarah 可见内容，或在缺少截图时要求用户重新用 Command 快捷键从目标 App 发起。',
    );
  }

  lines.push(`当前判断：${webContext ? '网页/浏览器优先' : '非网页，截图优先'}；URL=${hasUrl ? '有' : '无'}；截图=${hasScreenshot ? context.screenshotPath : '无'}`);
  return lines.join('\n');
}

// ─── AgentService ─────────────────────────────────────────────────────────────

export class AgentService extends EventEmitter {
  private proc: ReturnType<typeof spawn> | null = null;
  private running = false;
  private runVersion = 0;
  private activeRunId: string | null = null;
  private activeRuntime: AgentRuntimeId | null = null;

  /** Queue for tasks submitted while another is running. */
  private pendingExecution: { instruction: string; context: AgentContext; resolve: () => void } | null = null;

  /** Resolved absolute paths (lazy, set on first execute) */
  private openclawBin = 'openclaw';
  private hermesBin = 'hermes';
  private codexBin = 'codex';
  private claudeBin = 'claude';
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
    this.hermesBin = resolveBinary('hermes');
    this.codexBin = resolveBinary('codex');
    this.claudeBin = resolveBinary('claude');
    this.enhancedPath = buildEnhancedPath(this.openclawBin);

    const lark = resolveBinary('lark-cli');
    this.larkBin = lark !== 'lark-cli' ? lark : null;

    logger.info('AgentService initialized', {
      openclawBin: this.openclawBin,
      hermesBin: this.hermesBin,
      codexBin: this.codexBin,
      claudeBin: this.claudeBin,
      larkBin: this.larkBin ?? '(not found)',
    });
  }

  private async resolveEffectiveRuntime(): Promise<AgentRuntimeId> {
    const selection = await clawDeskSettingsService.getAgentRuntimeSelection();
    return selection.effective ?? selection.selected ?? 'openclaw';
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
      let runtime: AgentRuntimeId = 'openclaw';
      let useGatewayAgent = shouldUseGatewayAgent();
      let prompt = '';
      const runId = `sarah-${process.pid}-${Date.now().toString(36)}-${runVersion}`;

      void (async () => {
        runtime = await this.resolveEffectiveRuntime();
        if (runVersion !== this.runVersion || !this.running) {
          resolve();
          return;
        }
        this.activeRuntime = runtime;
        useGatewayAgent = runtime === 'openclaw' && shouldUseGatewayAgent();
        prompt = useGatewayAgent
          ? this.buildGatewayPrompt(instruction, context, memory, localToolsSummary)
          : this.buildPrompt(instruction, context, memory, localToolsSummary);
        this.activeRunId = runId;
        const hermesToolsets = resolveHermesToolsets(instruction);
        const gatewayParams = buildGatewayAgentParams({
          prompt,
          sessionId: this.sessionId,
          runId,
        });
        logger.info('Agent runtime selected', {
          runtime,
          useGatewayAgent,
          gatewayTransport: runtime === 'openclaw' && useGatewayAgent && shouldUseOpenClawWebSocketAgent() ? 'websocket' : undefined,
          hermesToolsets: runtime === 'hermes' ? hermesToolsets : undefined,
        });
        if (runtime !== 'openclaw') {
          this.emit('chunk', {
            type: 'tool_use',
            text: `Starting ${this.runtimeDisplayName(runtime)} CLI`,
            toolName: this.runtimeDisplayName(runtime),
          });
        }
        if (runtime === 'openclaw' && useGatewayAgent && shouldUseOpenClawWebSocketAgent()) {
          await this.executeOpenClawGatewayWebSocket({
            runVersion,
            runId,
            tStart: tSpawn,
            params: JSON.parse(gatewayParams) as Record<string, unknown>,
            instruction,
          });
          resolve();
          return;
        }

        const proc = this.spawnRuntime(runtime, {
          prompt,
          hermesToolsets,
          gatewayParams,
          useGatewayAgent,
        });

        this.proc = proc;
        let fullResponse = '';
        let stdoutBuf = '';
        let stderrBuf = '';
        let tFirstStdout = 0;
        let tFirstStderr = 0;
        const stdout = proc.stdout;
        const stderr = proc.stderr;

        stdout?.on('data', (chunk: Buffer) => {
          if (tFirstStdout === 0) tFirstStdout = Date.now();
          const data = chunk.toString();
          stdoutBuf += data;
          if (runtime === 'codex') {
            for (const line of data.split('\n').map((item) => item.trim()).filter(Boolean)) {
              const parsed = parseCodexJsonLine(line);
              if (!parsed) continue;
              if (parsed.progress) {
                this.emit('chunk', { type: 'tool_use', text: parsed.progress, toolName: parsed.toolName });
              }
              if (parsed.text) {
                fullResponse += parsed.text;
                this.emit('chunk', { type: 'text', text: parsed.text });
              }
            }
          } else if (runtime === 'claude') {
            for (const line of data.split('\n').map((item) => item.trim()).filter(Boolean)) {
              const parsed = parseClaudeStreamJsonLine(line);
              if (!parsed) continue;
              if (parsed.progress) {
                this.emit('chunk', { type: 'tool_use', text: parsed.progress, toolName: parsed.toolName });
              }
              if (parsed.text) {
                if (parsed.final && fullResponse.trim()) {
                  continue;
                }
                fullResponse += parsed.text;
                this.emit('chunk', { type: 'text', text: parsed.text });
              }
            }
          }
        });

        stderr?.on('data', (chunk: Buffer) => {
          if (tFirstStderr === 0) tFirstStderr = Date.now();
          const data = chunk.toString();
          stderrBuf += data;
          logger.debug(`${runtime} stderr`, { data: data.slice(0, 300) });
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
          this.activeRuntime = null;
          if (this.activeRunId === runId) {
            this.activeRunId = null;
          }
          const parsed = this.parseRuntimeResponse(runtime, stdoutBuf, fullResponse);
          logger.info('agent-runtime-timing', {
            runtime,
            transport: this.runtimeTransportName(runtime, useGatewayAgent),
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
              const textToEmit = runtime === 'codex' && fullResponse && parsed.text.startsWith(fullResponse)
                ? parsed.text.slice(fullResponse.length)
                : parsed.text;
              fullResponse = parsed.text;
              if (textToEmit) {
                await this.emitVisibleText(runVersion, textToEmit);
              }
            }
            memoryService.appendAction(instruction, fullResponse);
            if (fullResponse.trim()) {
              memoryService.appendTurn(instruction, fullResponse);
            }
            if (runVersion === this.runVersion) {
              this.emit('done');
            }
          } else {
            const cleanedError = runtime === 'hermes' || runtime === 'codex' || runtime === 'claude'
              ? sanitizeHermesError(stderrBuf)
              : sanitizeOpenClawError(stderrBuf);
            logger.warn('agent runtime exited non-zero', { runtime, code, stderr: cleanedError.slice(0, 400) });
            const isAuthError =
              cleanedError.includes('auth') ||
              cleanedError.includes('login') ||
              cleanedError.includes('API key') ||
              cleanedError.includes('401') ||
              cleanedError.includes('403');
            const runtimeName = this.runtimeDisplayName(runtime);
            const message = isAuthError
              ? `${runtimeName} 未登录或鉴权失败。请先在设置里切换运行时，或在终端完成 ${this.runtimeSetupCommand(runtime)}。`
              : `${runtimeName} 退出，代码 ${code}。\n可先在 Settings 切换 agent runtime 后重试。\n${cleanedError.slice(0, 200)}`;
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
          this.activeRuntime = null;
          if (this.activeRunId === runId) {
            this.activeRunId = null;
          }
          const runtimeBin = this.runtimeBinary(runtime);
          logger.error('Failed to spawn agent runtime', { runtime, code: err.code, bin: runtimeBin });
          const runtimeName = this.runtimeDisplayName(runtime);
          const message =
            err.code === 'ENOENT'
              ? `${runtimeName} CLI 未找到 (尝试路径: ${runtimeBin})。请先安装或在 Settings 切换运行时。`
              : `无法启动 ${runtimeName} CLI: ${err.message}`;
          this.emit('error', message);
          this.drainQueue();
          resolve();
        });
      })().catch((error) => {
        this.running = false;
        this.proc = null;
        this.activeRuntime = null;
        this.activeRunId = null;
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Failed to start agent runtime', { error: message });
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
    const activeRuntime = this.activeRuntime;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    if (runId && activeRuntime === 'openclaw' && shouldUseGatewayAgent()) {
      this.abortGatewayRun(runId);
    }
    this.activeRunId = null;
    this.activeRuntime = null;
    this.running = false;
    if (emitDone) {
      this.emit('done');
    }
    logger.info('AgentService: aborted');
  }

  private abortGatewayRun(runId: string): void {
    abortOpenClawGatewayRun({
      runId,
      sessionId: this.sessionId,
      agentId: resolveOpenClawAgentId(),
    });
  }

  private async executeOpenClawGatewayWebSocket(params: {
    runVersion: number;
    runId: string;
    tStart: number;
    params: Record<string, unknown>;
    instruction: string;
  }): Promise<void> {
    let fullResponse = '';
    let streamed = false;
    let tFirstDelta = 0;
    let tAccepted = 0;

    this.emit('chunk', {
      type: 'tool_use',
      text: 'Connecting to OpenClaw Gateway',
      toolName: 'OpenClaw Gateway',
    });

    const result = await runOpenClawGatewayAgent({
      params: params.params,
      timeoutMs: Number(process.env.SARAH_OPENCLAW_GATEWAY_TIMEOUT_MS ?? 180_000),
      onAccepted: () => {
        if (tAccepted === 0) tAccepted = Date.now();
        if (params.runVersion === this.runVersion) {
          this.emit('chunk', {
            type: 'tool_use',
            text: 'Gateway accepted the run',
            toolName: 'OpenClaw Gateway',
          });
        }
      },
      onProgress: (message, toolName) => {
        if (params.runVersion === this.runVersion) {
          this.emit('chunk', { type: 'tool_use', text: message, toolName });
        }
      },
      onText: (delta) => {
        if (params.runVersion !== this.runVersion) return;
        if (tFirstDelta === 0) tFirstDelta = Date.now();
        streamed = true;
        fullResponse += delta;
        this.emit('chunk', { type: 'text', text: delta });
      },
    });

    if (params.runVersion !== this.runVersion) {
      return;
    }

    if (!streamed && result.text) {
      fullResponse = result.text;
      await this.emitVisibleText(params.runVersion, result.text);
    } else if (streamed && result.text && result.text.length > fullResponse.length && result.text.startsWith(fullResponse)) {
      const remainder = result.text.slice(fullResponse.length);
      fullResponse = result.text;
      await this.emitVisibleText(params.runVersion, remainder);
    }

    this.running = false;
    this.proc = null;
    this.activeRuntime = null;
    if (this.activeRunId === params.runId) {
      this.activeRunId = null;
    }

    logger.info('agent-runtime-timing', {
      runtime: 'openclaw',
      transport: 'gateway-websocket',
      accepted_ms: tAccepted ? tAccepted - params.tStart : null,
      first_delta_ms: tFirstDelta ? tFirstDelta - params.tStart : null,
      total_ms: Date.now() - params.tStart,
      streamed,
      parsed_chars: fullResponse.length,
    });

    memoryService.appendAction(params.instruction, fullResponse);
    if (fullResponse.trim()) {
      memoryService.appendTurn(params.instruction, fullResponse);
    }
    if (params.runVersion === this.runVersion) {
      this.emit('done');
    }
    this.drainQueue();
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

  private runtimeDisplayName(runtime: AgentRuntimeId): string {
    if (runtime === 'hermes') return 'Hermes';
    if (runtime === 'codex') return 'Codex';
    if (runtime === 'claude') return 'Claude Code';
    return 'OpenClaw';
  }

  private runtimeBinary(runtime: AgentRuntimeId): string {
    if (runtime === 'hermes') return this.hermesBin;
    if (runtime === 'codex') return this.codexBin;
    if (runtime === 'claude') return this.claudeBin;
    return this.openclawBin;
  }

  private runtimeSetupCommand(runtime: AgentRuntimeId): string {
    if (runtime === 'hermes') return '`hermes status`';
    if (runtime === 'codex') return '`codex`';
    if (runtime === 'claude') return '`claude`';
    return '`openclaw whoami`';
  }

  private runtimeTransportName(runtime: AgentRuntimeId, useGatewayAgent: boolean): string {
    if (runtime === 'hermes') return 'hermes-oneshot';
    if (runtime === 'codex') return 'codex-exec';
    if (runtime === 'claude') return 'claude-print';
    return useGatewayAgent ? 'gateway-call' : 'agent-cli';
  }

  private parseRuntimeResponse(runtime: AgentRuntimeId, stdout: string, streamedText: string): { text: string } | null {
    if (runtime === 'hermes') return parseHermesResponse(stdout);
    if (runtime === 'codex') {
      if (streamedText.trim()) return { text: streamedText.trim() };
      return parsePlainTextResponse(stdout);
    }
    if (runtime === 'claude') {
      if (streamedText.trim()) return { text: streamedText.trim() };
      return parsePlainTextResponse(stdout);
    }
    return parseOpenClawResponse(stdout);
  }

  private spawnRuntime(
    runtime: AgentRuntimeId,
    options: {
      prompt: string;
      hermesToolsets: string;
      gatewayParams: string;
      useGatewayAgent: boolean;
    },
  ): ReturnType<typeof spawn> {
    if (runtime === 'hermes') {
      return spawn(
        this.hermesBin,
        ['--oneshot', options.prompt, '--toolsets', options.hermesToolsets],
        {
          env: { ...process.env, PATH: buildEnhancedPath(this.hermesBin), HERMES_ACCEPT_HOOKS: '1' },
          shell: false,
        },
      );
    }

    if (runtime === 'codex') {
      return spawn(
        this.codexBin,
        [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--cd', process.cwd(),
          options.prompt,
        ],
        {
          env: { ...process.env, PATH: buildEnhancedPath(this.codexBin) },
          shell: false,
        },
      );
    }

    if (runtime === 'claude') {
      return spawn(
        this.claudeBin,
        [
          '-p',
          '--verbose',
          '--output-format', 'stream-json',
          '--include-partial-messages',
          '--permission-mode', process.env.SARAH_CLAUDE_PERMISSION_MODE?.trim() || 'default',
          options.prompt,
        ],
        {
          env: { ...process.env, PATH: buildEnhancedPath(this.claudeBin) },
          shell: false,
        },
      );
    }

    return spawn(
      this.openclawBin,
      options.useGatewayAgent
        ? [
            'gateway',
            'call',
            'agent',
            '--expect-final',
            '--json',
            '--timeout', String(Number(process.env.SARAH_OPENCLAW_GATEWAY_TIMEOUT_MS ?? 180_000)),
            '--params', options.gatewayParams,
          ]
        : [
            'agent',
            '--agent', resolveOpenClawAgentId(),
            '--json',
            '--thinking', process.env.SARAH_OPENCLAW_THINKING?.trim() || 'off',
            '--session-id', this.sessionId,
            '--message', options.prompt,
            ...(resolveOpenClawModel() ? ['--model', resolveOpenClawModel() as string] : []),
          ],
      {
        env: { ...process.env, PATH: this.enhancedPath },
        shell: false,
      },
    );
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
      context.ocrText ? `截图 OCR：\n${context.ocrText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contextHint = buildContextAcquisitionPolicy(context);

    return `你是 Sarah 的快速桌面助手。请用中文直接回答，优先简洁，但要主动完成可执行任务。

当前屏幕上下文：
${screenContext}

${contextHint}

可用能力与任务执行原则：
- 网页/浏览器内容：优先使用 web-access / browser 工具读取当前 URL 或当前标签页。
- 非网页内容：优先使用截图路径进行视觉理解，不要要求用户自己截图。
- 飞书写入：先整理内容，再使用本机 Local Tools 摘要里的飞书 CLI；如果摘要显示 lark-cli 的绝对路径，优先直接用那个路径。不要猜 lark 或 feishu 命令。
- 如系统要求授权，只请求写入授权或目标位置确认；不要要求用户自己截图或复制页面内容。
- 工具失败时要自动切换备选路径：web-access 失败 → 截图；截图不可用 → 再向用户要内容。
- 如果用户说“当前页面/这个页面/这里/保存到飞书”，默认就是让你根据当前上下文主动处理。
- 优先使用读取/API/CLI；只有确实需要点击页面时才调用浏览器自动化，避免无意义地慢速操作 Chrome。

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
      context.ocrText ? `截图 OCR：\n${context.ocrText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contextAcquisitionPolicy = buildContextAcquisitionPolicy(context);

    // Tell the agent honestly what page-level context is available, so it
    // does not invent a “current page content” it never received.
    const hasUrl = !!context.url;
    const hasScreenshot = !!context.screenshotPath;
    const contextLimitations: string[] = [];
    if (!hasUrl && !hasScreenshot) {
      contextLimitations.push(
        '- 当前没有 URL 或截图路径。只有在 web-access 也无法访问当前浏览器/页面时，才要求用户提供内容。',
      );
    } else if (!hasUrl && hasScreenshot) {
      contextLimitations.push(
        '- 当前没有 URL，但有截图路径。用户说”当前页面/这个页面”时，直接分析截图内容来完成任务。不要要求用户提供 URL 或自己截图。',
      );
    }
    if (context.ocrText) {
      contextLimitations.push(
        '- 当前截图已经做过 OCR。涉及 Telegram/微信/PDF/图片/非浏览器 App 时，优先使用“截图 OCR”中的可见文字，并结合截图路径核对。',
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

═══ 本机 CLI 使用原则 ═══
- 本机 Local Tools 摘要会列出真实可用的二进制路径。调用 CLI 时优先用摘要里的绝对路径，不要猜短命令名。
- 飞书 CLI 当前通常是 lark-cli，不是 lark 或 feishu。如果摘要显示 /opt/homebrew/bin/lark-cli，就直接调用这个路径。
- 飞书写入前可以先运行 lark-cli auth status / lark-cli doctor 确认登录；写入动作只在用户明确要求或已授权时执行。
- 对“保存到飞书”的请求，不要只回复计划；应实际读取当前页面/截图，整理内容，并调用飞书 CLI 或相应飞书能力写入。
- 优先使用 CLI/API 和网页文本抽取；只有无法直接读取时才用慢速浏览器自动化点击。

═══ 场景决策树 ═══
1. “保存/记录到飞书”类指令：
   - 应用名包含 Lark/Feishu/飞书 → 直接用 lark-doc 或 lark-im
   - 应用名是浏览器或上下文有 URL → web-access 抽取当前页面 → lark-doc/lark-im 写入；web-access 失败时转截图
   - 其他任何应用（Codex、CodePilot、微信、备忘录等）→ 直接分析截图内容 → 提取文字 → 写入飞书
2. “去 XX 网站搜索/看看/找一下”类指令：
   - 不管当前在什么应用，直接用 web-access 打开浏览器操作
   - web-access 通过 CDP 连接用户已打开的 Chrome，保留登录态（X、GitHub 等无需重新登录）
3. web-access 抽取时，优先使用「当前屏幕上下文」中的 URL
4. web-access 不可用或不是网页时 → 分析截图内容，不要要求用户提供 URL 或自己截图
5. 只有当 URL、web-access、截图路径都不可用时，才要求用户提供内容

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

═══ 强制上下文获取策略 ═══
${contextAcquisitionPolicy}

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
