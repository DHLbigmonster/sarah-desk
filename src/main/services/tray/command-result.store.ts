/**
 * In-memory store for the most recent Command mode agent result.
 *
 * Command mode runs silently in the background; the final result is
 * buffered here so the user can view it later by clicking the tray
 * "done-unread" (green-dot) indicator.
 */

import type { AgentContext } from '../../../shared/types/agent';

export interface CommandResultRecord {
  transcript: string;
  context: AgentContext;
  result: string;
  isError: boolean;
  finishedAt: number;
}

class CommandResultStore {
  private last: CommandResultRecord | null = null;

  set(record: CommandResultRecord): void {
    this.last = record;
  }

  get(): CommandResultRecord | null {
    return this.last;
  }

  clear(): void {
    this.last = null;
  }
}

export const commandResultStore = new CommandResultStore();
