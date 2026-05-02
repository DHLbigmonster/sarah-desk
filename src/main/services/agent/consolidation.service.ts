/**
 * Consolidation Service.
 * At app startup, checks whether yesterday's chat session has been summarised.
 * If not, it spawns the openclaw CLI to produce a concise daily summary and
 * stores it in memory.json via MemoryService.
 *
 * This runs entirely in the background; the UI is notified via
 * AGENT.DAILY_SUMMARY_READY once the summary is written.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log';
import { memoryService, yesterdayDate } from './memory.service';
import type { AgentMessage, DailySummary } from '../../../shared/types/agent';

const logger = log.scope('consolidation-service');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve openclaw binary path — reuse same resolution logic as AgentService. */
function resolveOpenClaw(): string {
  try {
    const found = execFileSync('which', ['openclaw'], { encoding: 'utf-8', timeout: 3000 }).trim();
    if (found) return found;
  } catch { /* not on PATH */ }

  const extras = [
    '/opt/node22/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${os.homedir()}/.local/bin`,
    `${os.homedir()}/.volta/bin`,
    `${os.homedir()}/.bun/bin`,
  ];
  for (const dir of extras) {
    const full = path.join(dir, 'openclaw');
    if (fs.existsSync(full)) return full;
  }

  const nvmRoot = path.join(os.homedir(), '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmRoot)) {
    const versions = (fs.readdirSync(nvmRoot) as string[]).sort().reverse();
    for (const ver of versions) {
      const full = path.join(nvmRoot, ver, 'bin', 'openclaw');
      if (fs.existsSync(full)) return full;
    }
  }

  return 'openclaw';
}

function parseOpenClawSummary(raw: string): string {
  try {
    const obj = JSON.parse(raw) as {
      result?: {
        finalAssistantVisibleText?: string;
        payloads?: Array<{ text?: string | null }>;
      };
    };
    return obj.result?.finalAssistantVisibleText
      ?? (obj.result?.payloads ?? [])
        .map((payload) => payload.text?.trim())
        .filter((text): text is string => Boolean(text))
        .join('\n\n');
  } catch {
    return raw;
  }
}

/** Build a summarisation prompt from a list of messages. */
function buildSummaryPrompt(date: string, messages: AgentMessage[]): string {
  const turns = messages
    .filter((m) => !m.isStreaming)
    .map((m) => `[${m.role === 'user' ? '用户' : '助手'}] ${m.content.slice(0, 400)}`)
    .join('\n\n');

  return `以下是 ${date} 的用户与 AI 助手的对话记录，请给出一个简洁的中文总结。
总结要求：
1. 2-4 条要点，描述当天完成的主要任务或讨论的话题
2. 如发现用户偏好或习惯，用一条简短说明
3. 最后一句话整体概括这一天

对话记录：
${turns}

请直接给出总结，不要加任何前缀，格式参考：
• 完成了 ...
• 讨论了 ...
• 用户偏好：...
整体：这一天主要围绕 ... 展开。`;
}

// ─── ConsolidationService ─────────────────────────────────────────────────────

type SummaryReadyCallback = (summary: DailySummary) => void;

export class ConsolidationService {
  private onReadyCallback: SummaryReadyCallback | null = null;
  private scheduler: NodeJS.Timeout | null = null;

  /** Register a callback that fires when a new summary is created. */
  onSummaryReady(cb: SummaryReadyCallback): void {
    this.onReadyCallback = cb;
  }

  /**
   * Check if yesterday needs consolidation and run it if so.
   * Call this once at app startup; it fires-and-forgets.
   */
  runIfNeeded(): void {
    if (!memoryService.needsConsolidation()) return;

    const yesterday = yesterdayDate();
    logger.info('Starting daily consolidation', { date: yesterday });

    this.consolidate(yesterday).catch((err: Error) => {
      logger.error('Consolidation failed', { err: err.message });
    });
  }

  startScheduler(): void {
    if (this.scheduler) return;
    this.runIfNeeded();

    const scheduleNext = (): void => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(now.getDate() + 1);
      next.setHours(0, 10, 0, 0);
      const delayMs = Math.max(60_000, next.getTime() - now.getTime());
      this.scheduler = setTimeout(() => {
        this.runIfNeeded();
        scheduleNext();
      }, delayMs);
      this.scheduler.unref?.();
    };

    scheduleNext();
  }

  private async consolidate(date: string): Promise<void> {
    const session = memoryService.loadSession(date);
    if (!session || session.messages.length === 0) {
      logger.info('No messages in session to consolidate', { date });
      return;
    }

    const userTurns = session.messages.filter((m) => m.role === 'user').length;
    if (userTurns === 0) {
      logger.info('Session has no user turns, skipping', { date });
      return;
    }

    const prompt = buildSummaryPrompt(date, session.messages);
    const summaryText = await this.runOpenClaw(prompt);

    if (!summaryText.trim()) {
      logger.warn('OpenClaw returned empty summary', { date });
      return;
    }

    const summary: DailySummary = {
      date,
      summary: summaryText.trim(),
      turnCount: userTurns,
      createdAt: Date.now(),
    };

    memoryService.addDailySummary(summary);
    logger.info('Daily summary stored', { date, chars: summaryText.length });

    this.onReadyCallback?.(summary);
  }

  /** Run openclaw CLI with a prompt, resolve with the full text output. */
  private runOpenClaw(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const openclawBin = resolveOpenClaw();
      const params = JSON.stringify({
        message: prompt,
        agentId: process.env.SARAH_OPENCLAW_AGENT_ID?.trim() || 'main',
        idempotencyKey: `sarah-summary-${Date.now().toString(36)}`,
        sessionId: `sarah-summary-${Date.now().toString(36)}`,
        thinking: 'off',
        timeout: 120,
        promptMode: 'minimal',
        bootstrapContextMode: 'lightweight',
        bootstrapContextRunKind: 'default',
        modelRun: true,
        cleanupBundleMcpOnRunEnd: true,
      });
      const proc = spawn(
        openclawBin,
        [
          'gateway',
          'call',
          'agent',
          '--expect-final',
          '--json',
          '--timeout',
          '180000',
          '--params',
          params,
        ],
        { env: { ...process.env }, shell: false },
      );

      let output = '';
      let errOutput = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        errOutput += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve(parseOpenClawSummary(output));
        } else {
          reject(new Error(`openclaw exited ${code}: ${errOutput.slice(0, 200)}`));
        }
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`spawn failed: ${err.message}`));
      });
    });
  }
}

export const consolidationService = new ConsolidationService();
