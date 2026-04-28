/**
 * Agent Window Manager.
 * Creates and manages the AI Agent panel window.
 *
 * This is a separate window from the ASR floating window:
 * - Centered answer overlay instead of a right-side chat panel
 * - focusable: true so ESC and follow-up hotkeys remain natural
 * - alwaysOnTop: false — behaves like a normal window, drops to back
 *   when the user clicks another app
 * - frame: false, transparent: true
 * - Loads the same floating.html but renders in "agent" mode
 *   (the renderer detects the mode via a query-string flag)
 *
 * NOTE: QuickAsk and Command both use this overlay as the temporary answer
 * surface. It is intentionally not a full chat window.
 */

import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { AgentContext, AgentStreamChunk, DailySummary } from '../../shared/types/agent';
import { getIsAppQuitting } from '../app-lifecycle';

const logger = log.scope('agent-window');

const AGENT_WINDOW_CONFIG = {
  WIDTH: 620,
  HEIGHT: 360,
} as const;

/**
 * Manages the AI Agent floating panel window.
 */
export class AgentWindowManager {
  private window: BrowserWindow | null = null;
  /** Whether the renderer has finished its first load (React mounted). */
  private rendererReady = false;
  /** Context buffered until the renderer is ready. */
  private pendingContext: AgentContext | null = null;
  private pendingShow = false;
  private pendingExternalSubmit: { instruction: string; context: AgentContext } | null = null;
  private pendingBufferedResult: {
    transcript: string;
    context: AgentContext;
    result: string;
    isError: boolean;
  } | null = null;

  /**
   * Create the agent window (hidden initially).
   * The window loads floating.html?mode=agent so the renderer
   * can render the AgentWindow component instead of the ASR window.
   */
  create(): void {
    if (this.window) return;

    const { x, y } = this.resolveCenteredBounds();

    this.window = new BrowserWindow({
      width: AGENT_WINDOW_CONFIG.WIDTH,
      height: AGENT_WINDOW_CONFIG.HEIGHT,
      x,
      y,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      hasShadow: true,
      focusable: true,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    // Load the same floating.html with ?mode=agent so the renderer
    // knows to mount AgentWindow instead of the ASR FloatingWindow.
    if (FLOATING_WINDOW_VITE_DEV_SERVER_URL) {
      const devUrl = FLOATING_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '');
      this.window.loadURL(`${devUrl}/floating.html?mode=agent`);
    } else {
      this.window.loadFile(
        path.join(__dirname, `../renderer/${FLOATING_WINDOW_VITE_NAME}/floating.html`),
        { query: { mode: 'agent' } },
      );
    }

    this.window.on('close', (event) => {
      if (getIsAppQuitting()) {
        return;
      }
      event.preventDefault();
      this.hide();
    });

    this.window.on('closed', () => {
      this.window = null;
      this.rendererReady = false;
      this.pendingShow = false;
      this.pendingExternalSubmit = null;
    });

    // Flush any buffered context once the renderer has mounted.
    this.window.webContents.on('did-finish-load', () => {
      this.rendererReady = true;
      if (this.pendingContext) {
        this.window?.webContents.send(IPC_CHANNELS.AGENT.SHOW, {
          context: this.pendingContext,
        });
        this.pendingContext = null;
      }
      if (this.pendingShow) {
        this.window?.show();
        this.window?.focus();
        this.pendingShow = false;
      }
      if (this.pendingExternalSubmit) {
        this.window?.webContents.send(IPC_CHANNELS.AGENT.EXTERNAL_SUBMIT, this.pendingExternalSubmit);
        this.pendingExternalSubmit = null;
      }
      if (this.pendingBufferedResult) {
        this.window?.webContents.send(IPC_CHANNELS.AGENT.SHOW_RESULT, this.pendingBufferedResult);
        this.pendingBufferedResult = null;
      }
    });

    logger.info('Agent window created');
  }

  /**
   * Show the agent window and send the captured context to the renderer.
   *
   * If the renderer has not finished its first load yet, the context is
   * buffered and flushed from the "did-finish-load" handler. This avoids
   * a race where the context IPC arrives before React has subscribed.
   */
  showWithContext(context: AgentContext): void {
    if (!this.window) this.create();
    this.positionWindow();

    if (this.rendererReady) {
      this.window?.show();
      this.window?.focus();
      this.window?.webContents.send(IPC_CHANNELS.AGENT.SHOW, { context });
    } else {
      this.pendingContext = context;
      this.pendingShow = true;
    }

    logger.info('Agent window shown', { appName: context.appName });
  }

  /**
   * Hide the agent window.
   */
  hide(): void {
    this.window?.hide();
    logger.info('Agent window hidden');
  }

  /**
   * Send a streaming text chunk to the renderer.
   */
  sendChunk(chunk: AgentStreamChunk): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STREAM_CHUNK, chunk);
  }

  /**
   * Notify the renderer that a turn is complete.
   */
  sendDone(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STREAM_DONE);
  }

  /**
   * Send an error to the renderer.
   */
  sendError(message: string): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STREAM_ERROR, message);
  }

  /**
   * Send an STT transcript result to the renderer.
   */
  sendSttResult(text: string): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.STT_RESULT, text);
  }

  /**
   * Show the window with a pre-computed result (Command mode silent-path).
   * Renders `transcript` as the user message and `result` as the assistant
   * message without firing a new agent run.
   */
  showWithBufferedResult(
    transcript: string,
    context: AgentContext,
    result: string,
    isError = false,
  ): void {
    if (!this.window) this.create();
    this.positionWindow();

    const payload = { transcript, context, result, isError };
    if (this.rendererReady) {
      this.window?.show();
      this.window?.focus();
      this.window?.webContents.send(IPC_CHANNELS.AGENT.SHOW_RESULT, payload);
    } else {
      this.pendingBufferedResult = payload;
      this.pendingShow = true;
    }

    logger.info('Agent window shown with buffered result', { appName: context.appName });
  }

  sendExternalSubmit(instruction: string, context: AgentContext): void {
    if (!this.window || this.window.isDestroyed()) {
      this.create();
    }

    const payload = { instruction, context };
    if (this.rendererReady) {
      this.window?.webContents.send(IPC_CHANNELS.AGENT.EXTERNAL_SUBMIT, payload);
    } else {
      this.pendingExternalSubmit = payload;
    }
  }

  /**
   * Notify the renderer that a new daily summary is available.
   */
  sendDailySummaryReady(summary: DailySummary): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.AGENT.DAILY_SUMMARY_READY, summary);
  }

  /**
   * Whether the window is currently visible.
   */
  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  /**
   * Destroy the window on app quit.
   */
  destroy(): void {
    if (this.window) {
      this.window.removeAllListeners('close');
      this.window.destroy();
      this.window = null;
    }
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  private positionWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const { x, y } = this.resolveCenteredBounds();
    this.window.setPosition(x, y);
  }

  private resolveCenteredBounds(): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { x, y, width, height } = display.workArea;

    return {
      x: Math.round(x + (width - AGENT_WINDOW_CONFIG.WIDTH) / 2),
      y: Math.round(y + (height - AGENT_WINDOW_CONFIG.HEIGHT) / 2),
    };
  }
}

/**
 * Singleton instance.
 */
export const agentWindow = new AgentWindowManager();
