/**
 * Floating Window Manager.
 * Manages the compact ASR HUD that displays only voice mode + current phase.
 */

import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { ASRResult, ASRStatus } from '../../shared/types/asr';
import type { VoiceOverlayState } from '../../shared/types/push-to-talk';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { getIsAppQuitting } from '../app-lifecycle';

const FLOATING_WINDOW_CONFIG = {
  WIDTH: 184,
  HEIGHT: 48,
  BOTTOM_OFFSET: 90,
  AUTO_HIDE_DELAY: 2000,
} as const;

/**
 * Manages the ASR floating window lifecycle and communication.
 */
export class FloatingWindowManager {
  private window: BrowserWindow | null = null;
  private autoHideTimer: NodeJS.Timeout | null = null;
  private shouldDeferHide = false;
  private suppressed = false;

  /**
   * Create the floating window.
   * The window is created hidden and shown when needed.
   */
  create(): void {
    if (this.window) {
      return;
    }

    // Get primary display to calculate centered position
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Calculate centered position at bottom of screen
    const x = Math.round((screenWidth - FLOATING_WINDOW_CONFIG.WIDTH) / 2);
    const y = screenHeight - FLOATING_WINDOW_CONFIG.HEIGHT - FLOATING_WINDOW_CONFIG.BOTTOM_OFFSET;

    this.window = new BrowserWindow({
      width: FLOATING_WINDOW_CONFIG.WIDTH,
      height: FLOATING_WINDOW_CONFIG.HEIGHT,
      x,
      y,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false, // Fixed position at bottom center
      show: false,
      hasShadow: false,
      // CRITICAL: Prevent window from stealing focus
      // This allows text insertion to work in the previously focused app
      focusable: false,
      // macOS only: deliver the first mouse-down to the renderer even when
      // the window is non-focusable. Without this, clicking the X/✓ buttons
      // on a transparent + focusable:false window can be silently dropped.
      acceptFirstMouse: true,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    // Make window visible on all workspaces (macOS/Linux)
    // This must be called after window creation
    // NOTE: Temporarily disabled - may cause dock icon to hide on macOS
    // this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Load the floating window HTML
    if (FLOATING_WINDOW_VITE_DEV_SERVER_URL) {
      // In dev mode, we need to explicitly load floating.html
      // since Vite serves the root as index.html by default
      const devUrl = FLOATING_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '');
      this.window.loadURL(`${devUrl}/floating.html`);
    } else {
      this.window.loadFile(
        path.join(__dirname, `../renderer/${FLOATING_WINDOW_VITE_NAME}/floating.html`),
      );
    }

    // Prevent the window from being closed, just hide it
    this.window.on('close', (event) => {
      if (getIsAppQuitting()) {
        return;
      }
      event.preventDefault();
      this.hide();
    });

    // Clean up reference when window is destroyed
    this.window.on('closed', () => {
      this.window = null;
    });
  }

  /**
   * Show the floating window without stealing focus.
   * Uses showInactive() to keep focus on the user's previous app.
   */
  show(): void {
    if (!this.window) {
      this.create();
    }
    this.clearAutoHideTimer();

    this.window?.showInactive();
  }

  /**
   * Hide the floating window.
   */
  hide(): void {
    if (this.shouldDeferHide) {
      return;
    }
    this.clearAutoHideTimer();
    this.window?.hide();
  }

  /**
   * Force hide the floating window, ignoring deferHide flag.
   */
  forceHide(): void {
    this.shouldDeferHide = false;
    this.clearAutoHideTimer();
    this.window?.hide();
  }

  /**
   * Destroy the floating window.
   */
  destroy(): void {
    this.clearAutoHideTimer();
    if (this.window) {
      this.window.removeAllListeners('close');
      this.window.destroy();
      this.window = null;
    }
  }

  /**
   * Send ASR status update to the floating window.
   * @param status - The current ASR status
   */
  sendStatus(status: ASRStatus): void {
    if (this.suppressed) {
      return;
    }
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    // Show window for active statuses
    if (
      status === 'connecting' ||
      status === 'listening' ||
      status === 'processing' ||
      status === 'routing' ||
      status === 'executing' ||
      status === 'done'
    ) {
      this.show();
    }

    // Auto-hide after recognition is done
    if (status === 'done') {
      this.scheduleAutoHide();
    }

    // Hide on idle - hide FIRST before sending status to prevent visual bounce
    // (renderer re-rendering with no content before window hides)
    if (status === 'idle') {
      this.hide();
      // Don't send 'idle' status to renderer - window is already hidden
      return;
    }

    this.window.webContents.send(IPC_CHANNELS.ASR.STATUS, status);
  }

  /**
   * Send ASR result to the floating window.
   * @param result - The ASR result containing transcribed text
   */
  sendResult(result: ASRResult): void {
    if (this.suppressed) {
      return;
    }
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.webContents.send(IPC_CHANNELS.ASR.RESULT, result);
  }

  sendAudioLevel(level: number): void {
    if (this.suppressed) {
      return;
    }
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.webContents.send(IPC_CHANNELS.ASR.LEVEL, level);
  }

  sendVoiceState(state: VoiceOverlayState): void {
    if (this.suppressed) {
      return;
    }
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.webContents.send(IPC_CHANNELS.PUSH_TO_TALK.STATE, state);
  }

  allowHide(): void {
    this.shouldDeferHide = false;
    this.hide();
  }

  deferHide(): void {
    this.shouldDeferHide = true;
  }

  /**
   * Send error message to the floating window.
   * @param error - The error message
   */
  sendError(error: string): void {
    if (this.suppressed) {
      return;
    }
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    // Show window to display error
    this.show();
    this.window.webContents.send(IPC_CHANNELS.ASR.ERROR, error);
    // Auto-hide after showing error
    this.scheduleAutoHide();
  }

  /**
   * Check if the floating window is currently visible.
   */
  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  /**
   * Get the BrowserWindow instance (for testing purposes).
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  setContentHeight(contentHeight: number): void {
    void contentHeight;
  }

  suppress(): void {
    this.suppressed = true;
    this.forceHide();
  }

  resume(): void {
    this.suppressed = false;
  }

  /**
   * Schedule auto-hide of the window.
   */
  private scheduleAutoHide(): void {
    this.clearAutoHideTimer();
    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, FLOATING_WINDOW_CONFIG.AUTO_HIDE_DELAY);
  }

  /**
   * Clear the auto-hide timer.
   */
  private clearAutoHideTimer(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
}

/**
 * Singleton instance of the floating window manager.
 */
export const floatingWindow = new FloatingWindowManager();
