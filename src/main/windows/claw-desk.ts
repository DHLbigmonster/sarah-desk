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
import { execFileSync } from 'node:child_process';
import type { ClawDeskStatus } from '../../shared/types/clawdesk';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setQuitting(_value: boolean): void {
  // No-op — ClawDesk window removed. Kept for API compatibility.
}

const DEFAULT_PORT = 18789;
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

interface GatewayCreds {
  port: number;
  token: string | null;
  configFound: boolean;
  tokenConfigured: boolean;
}

function readGatewayCreds(): GatewayCreds {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw) as {
      gateway?: { port?: number; auth?: { token?: string } };
    };
    const port = cfg.gateway?.port ?? DEFAULT_PORT;
    const token = cfg.gateway?.auth?.token?.trim() || null;
    return {
      port,
      token,
      configFound: true,
      tokenConfigured: Boolean(token),
    };
  } catch {
    return {
      port: DEFAULT_PORT,
      token: null,
      configFound: false,
      tokenConfigured: false,
    };
  }
}

function isOpenClawInstalled(): boolean {
  try {
    return execFileSync('which', ['openclaw'], { encoding: 'utf-8', timeout: 1500 }).trim().length > 0;
  } catch {
    return false;
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

    if (!creds.configFound) {
      const installed = isOpenClawInstalled();
      return {
        state: 'offline',
        endpoint: `127.0.0.1:${creds.port}`,
        port: creds.port,
        tokenConfigured: creds.tokenConfigured,
        configFound: false,
        workspaceAvailable: false,
        detail: installed
          ? 'OpenClaw is installed, but ~/.openclaw/openclaw.json is missing. Run `openclaw onboard` or `openclaw setup`.'
          : 'OpenClaw CLI is not installed. Dictation works, but Command and Quick Ask need OpenClaw.',
        checkedAt,
      };
    }

    if (!creds.tokenConfigured) {
      return {
        state: 'offline',
        endpoint: `127.0.0.1:${creds.port}`,
        port: creds.port,
        tokenConfigured: false,
        configFound: true,
        workspaceAvailable: false,
        detail: 'OpenClaw gateway token is missing. Run `openclaw gateway restart` or re-run onboarding.',
        checkedAt,
      };
    }

    const reachable = await probePort(creds.port);
    if (reachable) {
      return {
        state: 'connected',
        endpoint: `127.0.0.1:${creds.port}`,
        port: creds.port,
        tokenConfigured: creds.tokenConfigured,
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
      tokenConfigured: creds.tokenConfigured,
      configFound: true,
      workspaceAvailable: false,
      detail: 'Gateway is not responding. Start it with `openclaw gateway start` or `openclaw gateway run`.',
      checkedAt,
    };
  }

  async refreshStatus(): Promise<ClawDeskStatus> {
    return this.getStatus();
  }

  async getWorkspaceTarget(): Promise<{ success: boolean; url?: string; error?: string }> {
    const creds = readGatewayCreds();
    if (!creds.configFound) {
      return { success: false, error: 'OpenClaw config not found. Run `openclaw onboard` first.' };
    }
    if (!creds.token) {
      return { success: false, error: 'OpenClaw gateway token is missing. Re-run OpenClaw onboarding.' };
    }
    const reachable = await probePort(creds.port, 600);
    if (!reachable) {
      return { success: false, error: 'OpenClaw gateway is not running. Run `openclaw gateway start`.' };
    }
    return {
      success: true,
      url: `http://127.0.0.1:${creds.port}/#token=${encodeURIComponent(creds.token)}`,
    };
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
