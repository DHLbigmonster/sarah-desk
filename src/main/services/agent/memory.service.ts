/**
 * Memory Service.
 * Persists user preferences, recent actions, daily summaries, and session
 * messages to local JSON files under ~/.sarah/.
 *
 * Directory layout:
 *   ~/.sarah/
 *     memory.json          — preferences, recent_actions, learned_patterns, daily_summaries
 *     screenshots/         — rotating PNGs from context capture
 *     sessions/            — one JSON file per day (YYYY-MM-DD.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import log from 'electron-log';
import type { AgentMessage, DailySummary, PersistedSession } from '../../../shared/types/agent';

const logger = log.scope('memory-service');

const LEGACY_MEMORY_DIR = path.join(os.homedir(), '.feishu-agent');
export const MEMORY_DIR = path.join(os.homedir(), '.sarah');
export const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.json');
const SCREENSHOTS_DIR = path.join(MEMORY_DIR, 'screenshots');
const SESSIONS_DIR = path.join(MEMORY_DIR, 'sessions');

export interface AgentMemory {
  /** User-configurable preferences injected into every prompt */
  preferences: Record<string, string>;
  /** Rolling log of recent instructions and their outcomes */
  recent_actions: Array<{
    timestamp: number;
    instruction: string;
    result: string;
  }>;
  /** Free-form patterns the user has taught the agent */
  learned_patterns: Record<string, string>;
  /** Daily summary cards (newest first) */
  daily_summaries: DailySummary[];
}

const DEFAULT_MEMORY: AgentMemory = {
  preferences: {
    feishu_default_wiki_space: '',
    feishu_inbox_folder: '收集箱',
    language: '中文',
  },
  recent_actions: [],
  learned_patterns: {},
  daily_summaries: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for a given Date (defaults to today). */
export function isoDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns YYYY-MM-DD string for yesterday. */
export function yesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

// ─── MemoryService ────────────────────────────────────────────────────────────

export class MemoryService {
  ensureDirectories(): void {
    if (!fs.existsSync(MEMORY_DIR) && fs.existsSync(LEGACY_MEMORY_DIR)) {
      try {
        fs.cpSync(LEGACY_MEMORY_DIR, MEMORY_DIR, { recursive: true, errorOnExist: false });
        logger.info('Migrated legacy memory directory', {
          from: LEGACY_MEMORY_DIR,
          to: MEMORY_DIR,
        });
      } catch (error) {
        logger.warn('Failed to migrate legacy memory directory', {
          from: LEGACY_MEMORY_DIR,
          to: MEMORY_DIR,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const dir of [MEMORY_DIR, SCREENSHOTS_DIR, SESSIONS_DIR]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info('Created directory', { path: dir });
      }
    }
  }

  // ── Core memory ─────────────────────────────────────────────────────────

  load(): AgentMemory {
    this.ensureDirectories();
    try {
      const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AgentMemory>;
      return {
        preferences: { ...DEFAULT_MEMORY.preferences, ...(parsed.preferences ?? {}) },
        recent_actions: parsed.recent_actions ?? [],
        learned_patterns: parsed.learned_patterns ?? {},
        daily_summaries: parsed.daily_summaries ?? [],
      };
    } catch {
      return { ...DEFAULT_MEMORY };
    }
  }

  save(memory: AgentMemory): void {
    this.ensureDirectories();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
  }

  appendAction(instruction: string, result: string): void {
    const memory = this.load();
    memory.recent_actions.unshift({
      timestamp: Date.now(),
      instruction,
      result: result.slice(0, 300),
    });
    memory.recent_actions = memory.recent_actions.slice(0, 20);
    this.save(memory);
    logger.debug('Appended action to memory', { instruction });
  }

  // ── Daily summaries ──────────────────────────────────────────────────────

  getDailySummaries(): DailySummary[] {
    return this.load().daily_summaries;
  }

  addDailySummary(summary: DailySummary): void {
    const memory = this.load();
    // Prepend (newest first); deduplicate by date
    memory.daily_summaries = [
      summary,
      ...memory.daily_summaries.filter((s) => s.date !== summary.date),
    ].slice(0, 90); // keep up to 90 days
    this.save(memory);
    logger.info('Daily summary saved', { date: summary.date });
  }

  hasDailySummary(date: string): boolean {
    return this.load().daily_summaries.some((s) => s.date === date);
  }

  // ── Session persistence ──────────────────────────────────────────────────

  sessionPath(date: string): string {
    this.ensureDirectories();
    return path.join(SESSIONS_DIR, `${date}.json`);
  }

  saveSession(messages: AgentMessage[], date: string = isoDate()): void {
    this.ensureDirectories();
    const session: PersistedSession = { date, messages, savedAt: Date.now() };
    fs.writeFileSync(this.sessionPath(date), JSON.stringify(session, null, 2), 'utf-8');
    logger.debug('Session saved', { date, count: messages.length });
  }

  appendTurn(userText: string, assistantText: string, date: string = isoDate()): void {
    this.ensureDirectories();
    const existing = this.loadSession(date);
    const now = Date.now();
    const messages: AgentMessage[] = [
      ...(existing?.messages ?? []),
      {
        id: `user-${now}`,
        role: 'user',
        content: userText,
        timestamp: now,
      },
      {
        id: `assistant-${now}`,
        role: 'assistant',
        content: assistantText,
        timestamp: now,
      },
    ];
    this.saveSession(messages, date);
  }

  loadSession(date: string): PersistedSession | null {
    const p = this.sessionPath(date);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as PersistedSession;
    } catch {
      logger.warn('Failed to load session', { date });
      return null;
    }
  }

  loadTodaySession(): PersistedSession | null {
    return this.loadSession(isoDate());
  }

  /** True if yesterday has a session file that has not yet been summarised. */
  needsConsolidation(): boolean {
    const yesterday = yesterdayDate();
    if (this.hasDailySummary(yesterday)) return false;
    return fs.existsSync(this.sessionPath(yesterday));
  }

  // ── Screenshot rotation ──────────────────────────────────────────────────

  /**
   * Delete oldest screenshots, keeping only the `keep` most recent.
   */
  rotateScreenshots(keep = 10): void {
    this.ensureDirectories();
    try {
      const files = fs
        .readdirSync(SCREENSHOTS_DIR)
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime); // newest first

      const toDelete = files.slice(keep);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(SCREENSHOTS_DIR, file.name));
      }
      if (toDelete.length > 0) {
        logger.debug('Rotated screenshots', { deleted: toDelete.length });
      }
    } catch (err) {
      logger.warn('Screenshot rotation failed', { err });
    }
  }

  get screenshotsDir(): string {
    this.ensureDirectories();
    return SCREENSHOTS_DIR;
  }
}

export const memoryService = new MemoryService();
