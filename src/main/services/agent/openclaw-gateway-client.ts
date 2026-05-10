import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import log from 'electron-log';

const logger = log.scope('openclaw-gateway-client');

const DEFAULT_OPENCLAW_PORT = 18789;
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const CLIENT_PROTOCOL_VERSION = 3;
const REQUEST_TIMEOUT_MS = 5_000;

interface OpenClawGatewayConfig {
  url: string;
  port: number;
  token: string | null;
  configFound: boolean;
}

interface GatewayResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { message?: string; code?: string };
}

interface GatewayEventFrame {
  event: string;
  payload?: unknown;
  seq?: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  expectFinal?: boolean;
  onAccepted?: (payload: unknown) => void;
}

export interface OpenClawGatewayAgentOptions {
  params: Record<string, unknown>;
  timeoutMs: number;
  onText: (delta: string) => void;
  onProgress?: (message: string, toolName?: string) => void;
  onAccepted?: (runId: string) => void;
}

export interface OpenClawGatewayAgentResult {
  text: string;
  meta?: Record<string, unknown>;
  runId?: string;
}

function readGatewayConfig(): OpenClawGatewayConfig {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as { gateway?: { port?: number; auth?: { token?: string } } };
    const port = Number(config.gateway?.port ?? DEFAULT_OPENCLAW_PORT);
    const token = config.gateway?.auth?.token?.trim() || null;
    return {
      url: `ws://127.0.0.1:${Number.isFinite(port) ? port : DEFAULT_OPENCLAW_PORT}`,
      port: Number.isFinite(port) ? port : DEFAULT_OPENCLAW_PORT,
      token,
      configFound: true,
    };
  } catch {
    return {
      url: `ws://127.0.0.1:${DEFAULT_OPENCLAW_PORT}`,
      port: DEFAULT_OPENCLAW_PORT,
      token: null,
      configFound: false,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function extractPayloadText(payload: unknown): { text: string; meta?: Record<string, unknown>; runId?: string } {
  const payloadObj = asRecord(payload);
  const runId = typeof payloadObj?.runId === 'string' ? payloadObj.runId : undefined;
  const result = asRecord(payloadObj?.result);
  const meta = asRecord(result?.meta) ?? undefined;
  const finalText = typeof result?.finalAssistantVisibleText === 'string'
    ? result.finalAssistantVisibleText.trim()
    : '';
  if (finalText) return { text: finalText, meta, runId };

  const payloads = Array.isArray(result?.payloads) ? result.payloads : [];
  const text = payloads
    .map((entry) => {
      const item = asRecord(entry);
      return typeof item?.text === 'string' ? item.text.trim() : '';
    })
    .filter(Boolean)
    .join('\n\n');
  return { text, meta, runId };
}

function formatProgress(stream: string, data: unknown): { message: string; toolName?: string } | null {
  const obj = asRecord(data);
  if (stream === 'lifecycle') {
    const phase = typeof obj?.phase === 'string' ? obj.phase : '';
    if (phase === 'start') return { message: 'Gateway run started' };
    if (phase === 'end') return { message: 'Gateway run finished' };
    return phase ? { message: `Gateway ${phase}` } : null;
  }

  const toolName = [
    obj?.toolName,
    obj?.tool,
    obj?.name,
    obj?.command,
    obj?.title,
    stream,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const message = [
    obj?.message,
    obj?.summary,
    obj?.status,
    obj?.phase,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (!toolName && !message) return null;
  return {
    toolName,
    message: message ? `${toolName ?? stream}: ${message}` : `Using ${toolName}`,
  };
}

class GatewayConnection {
  private ws: WebSocket | null = null;
  private requestSeq = 0;
  private pending = new Map<string, PendingRequest>();
  private connected = false;

  constructor(private readonly config: OpenClawGatewayConfig) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.url);
      this.ws = ws;
      const timer = setTimeout(() => {
        reject(new Error(`OpenClaw Gateway connection timed out at ${this.config.url}`));
        ws.close();
      }, REQUEST_TIMEOUT_MS);

      ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.on('message', (data) => this.handleMessage(data.toString()));
      ws.on('error', (error) => {
        clearTimeout(timer);
        this.rejectAll(error instanceof Error ? error : new Error(String(error)));
        reject(error instanceof Error ? error : new Error(String(error)));
      });
      ws.on('close', () => {
        this.rejectAll(new Error('OpenClaw Gateway connection closed'));
      });
    });

    await this.request('connect', {
      minProtocol: CLIENT_PROTOCOL_VERSION,
      maxProtocol: CLIENT_PROTOCOL_VERSION,
      client: {
        id: 'gateway-client',
        displayName: 'Sarah',
        version: '1.0.0',
        platform: process.platform,
        mode: 'backend',
      },
      caps: ['tool-events'],
      auth: this.config.token ? { token: this.config.token } : undefined,
      role: 'operator',
      scopes: ['operator.admin'],
    });
    this.connected = true;
  }

  async request(
    method: string,
    params: unknown,
    expectFinal = false,
    onAccepted?: (payload: unknown) => void,
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('OpenClaw Gateway is not connected');
    }

    const id = `sarah-${Date.now().toString(36)}-${++this.requestSeq}`;
    const frame = { type: 'req', id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, expectFinal, onAccepted });
      this.ws?.send(JSON.stringify(frame), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  onAgentEvent: ((event: GatewayEventFrame) => void) | null = null;

  close(): void {
    this.rejectAll(new Error('OpenClaw Gateway connection closed'));
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(raw: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      logger.debug('Ignored non-JSON gateway frame');
      return;
    }

    const obj = asRecord(frame);
    if (!obj) return;

    if (obj.type === 'res' && typeof obj.id === 'string') {
      this.handleResponse(obj as unknown as GatewayResponseFrame);
      return;
    }

    if (typeof obj.event === 'string') {
      const event = obj as unknown as GatewayEventFrame;
      if (event.event === 'agent') this.onAgentEvent?.(event);
    }
  }

  private handleResponse(frame: GatewayResponseFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;

    if (!frame.ok) {
      this.pending.delete(frame.id);
      pending.reject(new Error(frame.error?.message ?? frame.error?.code ?? 'OpenClaw Gateway request failed'));
      return;
    }

    const payloadObj = asRecord(frame.payload);
    if (pending.expectFinal && payloadObj?.status === 'accepted') {
      pending.onAccepted?.(frame.payload);
      return;
    }

    this.pending.delete(frame.id);
    pending.resolve(frame.payload);
  }

  private rejectAll(error: Error): void {
    if (!this.connected && this.pending.size === 0) return;
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export async function runOpenClawGatewayAgent(options: OpenClawGatewayAgentOptions): Promise<OpenClawGatewayAgentResult> {
  const config = readGatewayConfig();
  if (!config.configFound) {
    throw new Error('OpenClaw Gateway config not found at ~/.openclaw/openclaw.json.');
  }
  if (!config.token) {
    throw new Error('OpenClaw Gateway token is missing from ~/.openclaw/openclaw.json.');
  }

  const connection = new GatewayConnection(config);
  const requestedRunId = typeof options.params.idempotencyKey === 'string'
    ? options.params.idempotencyKey
    : undefined;
  let acceptedRunId: string | undefined = requestedRunId;
  let streamedText = '';
  let settled = false;
  const timeout = setTimeout(() => {
    connection.close();
  }, options.timeoutMs);

  connection.onAgentEvent = (event) => {
    const payload = asRecord(event.payload);
    const eventRunId = typeof payload?.runId === 'string' ? payload.runId : undefined;
    if (acceptedRunId && eventRunId && eventRunId !== acceptedRunId) return;
    const stream = typeof payload?.stream === 'string' ? payload.stream : '';
    const data = payload?.data;

    if (eventRunId && !acceptedRunId) {
      acceptedRunId = eventRunId;
      options.onAccepted?.(eventRunId);
    }

    if (stream === 'assistant') {
      const dataObj = asRecord(data);
      const delta = typeof dataObj?.delta === 'string'
        ? dataObj.delta
        : typeof dataObj?.text === 'string'
          ? dataObj.text
          : '';
      if (delta) {
        streamedText += delta;
        options.onText(delta);
      }
      return;
    }

    const progress = stream ? formatProgress(stream, data) : null;
    if (progress) options.onProgress?.(progress.message, progress.toolName);
  };

  try {
    await connection.connect();
    const response = await connection.request('agent', options.params, true, (acceptedPayload) => {
      const payload = asRecord(acceptedPayload);
      const runId = typeof payload?.runId === 'string' ? payload.runId : undefined;
      if (runId) {
        acceptedRunId = runId;
        options.onAccepted?.(runId);
      }
    });
    settled = true;
    const parsed = extractPayloadText(response);
    return {
      text: streamedText || parsed.text,
      meta: parsed.meta,
      runId: parsed.runId ?? acceptedRunId,
    };
  } finally {
    clearTimeout(timeout);
    if (!settled) {
      logger.debug('OpenClaw Gateway agent run ended before final response');
    }
    connection.close();
  }
}

export function abortOpenClawGatewayRun(params: { runId: string; sessionId: string; agentId: string; timeoutMs?: number }): void {
  const timeoutMs = params.timeoutMs ?? REQUEST_TIMEOUT_MS;
  void (async () => {
    const connection = new GatewayConnection(readGatewayConfig());
    const timer = setTimeout(() => connection.close(), timeoutMs);
    try {
      await connection.connect();
      await connection.request('sessions.abort', {
        key: `agent:${params.agentId}:explicit:${params.sessionId}`,
        runId: params.runId,
      });
    } catch (error) {
      logger.warn('Failed to abort OpenClaw Gateway run', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
      connection.close();
    }
  })();
}
