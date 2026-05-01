/**
 * ClawDesk legacy stub.
 *
 * The full ClawDesk debug console has been removed. This file retains:
 *   - setQuitting() — used by main.ts app lifecycle
 *   - getStatus()   — used by getMiniStatus() for OpenClaw gateway health
 *
 * All window management, IPC forwarding, and UI creation are gone.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ClawDeskStatus } from '../../shared/types/clawdesk';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setQuitting(_value: boolean): void {
  // No-op — ClawDesk window removed. Kept for API compatibility.
}

const DEFAULT_PORT = 18789;
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

interface GatewayCreds {
  port: number;
  token: string;
}

function readGatewayCreds(): GatewayCreds | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw) as {
      gateway?: { port?: number; auth?: { token?: string } };
    };
    const port = cfg.gateway?.port ?? DEFAULT_PORT;
    const token = cfg.gateway?.auth?.token;
    if (!token) return null;
    return { port, token };
  } catch {
    return null;
  }
}

function probePort(port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (value: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Lightweight stub that replaces the full ClawDeskMainWindowManager.
 * Only gateway status detection remains — all window/UI code is removed.
 */
class ClawDeskStub {
  async getStatus(): Promise<ClawDeskStatus> {
    const creds = readGatewayCreds();
    const checkedAt = Date.now();

    if (!creds) {
      return {
        state: 'offline',
        endpoint: `127.0.0.1:${DEFAULT_PORT}`,
        port: DEFAULT_PORT,
        tokenConfigured: false,
        configFound: false,
        workspaceAvailable: false,
        detail: 'OpenClaw config not found.',
        checkedAt,
      };
    }

    const reachable = await probePort(creds.port);
    if (reachable) {
      return {
        state: 'connected',
        endpoint: `127.0.0.1:${creds.port}`,
        port: creds.port,
        tokenConfigured: true,
        configFound: true,
        workspaceAvailable: true,
        detail: 'Gateway reachable.',
        checkedAt,
      };
    }

    return {
      state: 'offline',
      endpoint: `127.0.0.1:${creds.port}`,
      port: creds.port,
      tokenConfigured: true,
      configFound: true,
      workspaceAvailable: false,
      detail: 'Gateway is not responding.',
      checkedAt,
    };
  }

  async refreshStatus(): Promise<ClawDeskStatus> {
    return this.getStatus();
  }

  async getWorkspaceTarget(): Promise<{ success: boolean; url?: string; error?: string }> {
    return { success: false, error: 'Debug console has been removed.' };
  }

  showHome(): void { /* no-op — ClawDesk removed */ }
  toggle(): void { /* no-op */ }
  show(): void { /* no-op */ }
  hide(): void { /* no-op */ }
  isVisible(): boolean { return false; }
  getWindow(): null { return null; }
  create(): void { /* no-op */ }
  destroy(): void { /* no-op */ }
  sendChunk(): void { /* no-op */ }
  sendDone(): void { /* no-op */ }
  sendError(): void { /* no-op */ }
  sendDailySummaryReady(): void { /* no-op */ }
}

export { ClawDeskStub as ClawDeskMainWindowManager };
export const clawDeskMainWindow = new ClawDeskStub();
