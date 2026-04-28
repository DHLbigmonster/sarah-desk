/**
 * ClawDesk window manager.
 *
 * The window always has a local Home view that can open even when OpenClaw
 * is unavailable. Entering the full OpenClaw workspace is an explicit
 * secondary action triggered from Home.
 *
 * DEPRECATED FOR PRODUCT DIRECTION:
 * Sarah now prioritizes Mini mode (menubar + hotkeys + voice chain).
 * This legacy desktop UI stays in the repo as an optional debug / fallback
 * surface until the Mini replacement fully covers settings and gateway flows.
 */

import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { ClawDeskStatus } from '../../shared/types/clawdesk';
import type { AgentStreamChunk, DailySummary } from '../../shared/types/agent';

const logger = log.scope('claw-desk');

let isQuitting = false;
export function setQuitting(value: boolean): void {
  isQuitting = value;
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

function buildWorkspaceUrl(creds: GatewayCreds): string {
  return `http://127.0.0.1:${creds.port}/#token=${creds.token}`;
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

export class ClawDeskMainWindowManager {
  private window: BrowserWindow | null = null;
  private homeLoadPromise: Promise<void> | null = null;

  create(): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 760,
      minHeight: 560,
      show: false,
      title: 'Sarah Debug Console',
      backgroundColor: '#0b0e13',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 18 },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        webviewTag: true,
      },
    });

    this.window.on('close', (e) => {
      if (!isQuitting) {
        e.preventDefault();
        this.window?.hide();
      }
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    if (!app.isPackaged) {
      this.window.webContents.openDevTools({ mode: 'detach' });
    }

    void this.loadHome(true).catch((error: Error) => {
      logger.warn('Failed to preload ClawDesk Home', { error: error.message });
    });

    logger.info('ClawDesk window created');
  }

  toggle(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.create();
      this.show();
      return;
    }

    if (this.window.isVisible()) {
      this.window.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (!this.window || this.window.isDestroyed()) this.create();
    const win = this.window;
    if (!win) return;
    void this.loadHome(false);
    win.show();
    win.focus();
  }

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
        detail: 'OpenClaw config not found. Run openclaw configure first.',
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
        detail: 'Gateway reachable. Full workspace can be opened on demand.',
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
      detail: 'Gateway is not responding on the local port. Try refreshing or start openclaw gateway run.',
      checkedAt,
    };
  }

  async refreshStatus(): Promise<ClawDeskStatus> {
    return this.getStatus();
  }

  async getWorkspaceTarget(): Promise<{ success: boolean; url?: string; error?: string }> {
    const creds = readGatewayCreds();
    if (!creds) {
      return {
        success: false,
        error: 'OpenClaw config not found. Run openclaw configure before opening the workspace.',
      };
    }

    const reachable = await probePort(creds.port);
    if (!reachable) {
      return {
        success: false,
        error: 'OpenClaw workspace is not reachable yet. Refresh the connection or start openclaw gateway run.',
      };
    }

    return { success: true, url: buildWorkspaceUrl(creds) };
  }

  showHome(): void {
    if (!this.window || this.window.isDestroyed()) this.create();
    const win = this.window;
    if (!win) return;
    void this.loadHome(true);
    win.show();
    win.focus();
  }

  hide(): void {
    this.window?.hide();
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  sendChunk(chunk: AgentStreamChunk): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STREAM_CHUNK, chunk);
  }

  sendDone(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STREAM_DONE);
  }

  sendError(message: string): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STREAM_ERROR, message);
  }

  sendDailySummaryReady(summary: DailySummary): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.DAILY_SUMMARY_READY, summary);
  }

  private async loadHome(forceReload = false): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;

    if (!forceReload) {
      if (this.homeLoadPromise) return this.homeLoadPromise;
      if (this.window.webContents.getURL().includes('clawdesk.html')) return;
    }

    const loadPromise = (async (): Promise<void> => {
      if (CLAWDESK_WINDOW_VITE_DEV_SERVER_URL) {
        const devUrl = CLAWDESK_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '');
        await this.window?.loadURL(`${devUrl}/clawdesk.html`);
        return;
      }

      await this.window?.loadFile(
        path.join(__dirname, `../renderer/${CLAWDESK_WINDOW_VITE_NAME}/clawdesk.html`),
      );
    })().finally(() => {
      if (this.homeLoadPromise === loadPromise) {
        this.homeLoadPromise = null;
      }
    });

    this.homeLoadPromise = loadPromise;
    return loadPromise;
  }
}

export const clawDeskMainWindow = new ClawDeskMainWindowManager();
