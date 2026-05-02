import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';
import type {
  LocalToolApproval,
  LocalToolApprovalScope,
  LocalToolId,
} from '../../../shared/types/local-tools';

const logger = log.scope('local-tools:approvals');

type StoredApprovals = Record<string, LocalToolApproval>;

function approvalKey(toolId: LocalToolId, capabilityId: string): string {
  return `${toolId}.${capabilityId}`;
}

export class LocalToolsApprovalStore {
  private filePath: string | null = null;
  private cache: StoredApprovals = {};
  private sessionApprovals = new Set<string>();
  private loaded = false;

  private resolveFilePath(): string {
    if (this.filePath) return this.filePath;
    const userData = app.getPath('userData');
    this.filePath = path.join(userData, 'local-tools-approvals.json');
    return this.filePath;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = fs.readFileSync(this.resolveFilePath(), 'utf8');
      const parsed = JSON.parse(raw) as StoredApprovals;
      if (parsed && typeof parsed === 'object') {
        this.cache = parsed;
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        logger.warn('Failed to load approvals; starting fresh.', err.message);
      }
      this.cache = {};
    }
  }

  private persist(): void {
    try {
      const persistable: StoredApprovals = {};
      for (const [key, approval] of Object.entries(this.cache)) {
        if (approval.scope === 'always') {
          persistable[key] = approval;
        }
      }
      fs.writeFileSync(this.resolveFilePath(), JSON.stringify(persistable, null, 2), 'utf8');
    } catch (error) {
      logger.error('Failed to persist approvals', (error as Error).message);
    }
  }

  get(toolId: LocalToolId, capabilityId: string): LocalToolApproval | null {
    this.load();
    const key = approvalKey(toolId, capabilityId);
    const approval = this.cache[key];
    if (!approval) return null;
    if (approval.scope === 'session' && !this.sessionApprovals.has(key)) {
      delete this.cache[key];
      return null;
    }
    return approval;
  }

  set(toolId: LocalToolId, capabilityId: string, scope: LocalToolApprovalScope): LocalToolApproval {
    this.load();
    const key = approvalKey(toolId, capabilityId);
    const approval: LocalToolApproval = {
      scope,
      approvedAt: Date.now(),
      lastUsedAt: null,
    };
    this.cache[key] = approval;
    if (scope === 'session') {
      this.sessionApprovals.add(key);
    } else if (scope === 'always') {
      this.persist();
    }
    return approval;
  }

  revoke(toolId: LocalToolId, capabilityId: string): void {
    this.load();
    const key = approvalKey(toolId, capabilityId);
    delete this.cache[key];
    this.sessionApprovals.delete(key);
    this.persist();
  }

  consume(toolId: LocalToolId, capabilityId: string): void {
    this.load();
    const key = approvalKey(toolId, capabilityId);
    const approval = this.cache[key];
    if (!approval) return;
    approval.lastUsedAt = Date.now();
    if (approval.scope === 'one_time') {
      delete this.cache[key];
      return;
    }
    if (approval.scope === 'always') {
      this.persist();
    }
  }

  isApproved(toolId: LocalToolId, capabilityId: string): boolean {
    return this.get(toolId, capabilityId) !== null;
  }
}

export const approvalStore = new LocalToolsApprovalStore();
