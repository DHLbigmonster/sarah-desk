import { BrowserWindow } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { getIsAppQuitting } from '../app-lifecycle';

declare const MINI_SETTINGS_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MINI_SETTINGS_WINDOW_VITE_NAME: string;

const logger = log.scope('mini-settings-window');

const MINI_SETTINGS_CONFIG = {
  WIDTH: 420,
  HEIGHT: 660,
} as const;

export class MiniSettingsWindowManager {
  private window: BrowserWindow | null = null;

  create(): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: MINI_SETTINGS_CONFIG.WIDTH,
      height: MINI_SETTINGS_CONFIG.HEIGHT,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title: 'Sarah Settings',
      backgroundColor: '#1a1a1a',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 16 },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (MINI_SETTINGS_WINDOW_VITE_DEV_SERVER_URL) {
      const devUrl = MINI_SETTINGS_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '');
      this.window.loadURL(`${devUrl}/mini-settings.html`);
    } else {
      this.window.loadFile(
        path.join(__dirname, `../renderer/${MINI_SETTINGS_WINDOW_VITE_NAME}/mini-settings.html`),
      );
    }

    this.window.on('close', (event) => {
      if (getIsAppQuitting()) return;
      event.preventDefault();
      this.window?.hide();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    logger.info('Mini settings window created');
  }

  show(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.create();
    }
    this.window?.show();
    this.window?.focus();
  }

  destroy(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.removeAllListeners('close');
    this.window.destroy();
    this.window = null;
  }
}

export const miniSettingsWindow = new MiniSettingsWindowManager();
