import { BrowserWindow, screen, type Rectangle } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { getIsAppQuitting } from '../app-lifecycle';

declare const MENUBAR_POPOVER_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MENUBAR_POPOVER_WINDOW_VITE_NAME: string;

const logger = log.scope('menubar-popover-window');

const POPOVER_CONFIG = {
  WIDTH: 380,
  HEIGHT: 526,
  TOP_GAP: 8,
  EDGE_MARGIN: 8,
} as const;

export class MenubarPopoverWindowManager {
  private window: BrowserWindow | null = null;

  create(): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: POPOVER_CONFIG.WIDTH,
      height: POPOVER_CONFIG.HEIGHT,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      title: 'Sarah',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (MENUBAR_POPOVER_WINDOW_VITE_DEV_SERVER_URL) {
      const devUrl = MENUBAR_POPOVER_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '');
      this.window.loadURL(`${devUrl}/menubar-popover.html`);
    } else {
      this.window.loadFile(
        path.join(
          __dirname,
          `../renderer/${MENUBAR_POPOVER_WINDOW_VITE_NAME}/menubar-popover.html`,
        ),
      );
    }

    this.window.on('blur', () => {
      this.hide();
    });

    this.window.on('close', (event) => {
      if (getIsAppQuitting()) return;
      event.preventDefault();
      this.hide();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    logger.info('Menubar popover window created');
  }

  toggle(anchorBounds: Rectangle): void {
    if (this.window?.isVisible()) {
      this.hide();
      return;
    }
    this.show(anchorBounds);
  }

  show(anchorBounds: Rectangle): void {
    if (!this.window || this.window.isDestroyed()) {
      this.create();
    }
    if (!this.window || this.window.isDestroyed()) return;

    this.window.setBounds(this.calculateBounds(anchorBounds), false);
    this.window.show();
    this.window.focus();
  }

  hide(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
  }

  destroy(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.removeAllListeners('close');
    this.window.destroy();
    this.window = null;
  }

  private calculateBounds(anchorBounds: Rectangle): Rectangle {
    const display = screen.getDisplayNearestPoint({
      x: anchorBounds.x + Math.round(anchorBounds.width / 2),
      y: anchorBounds.y + Math.round(anchorBounds.height / 2),
    });
    const workArea = display.workArea;
    const centeredX = anchorBounds.x + Math.round(anchorBounds.width / 2) - Math.round(POPOVER_CONFIG.WIDTH / 2);
    const maxX = workArea.x + workArea.width - POPOVER_CONFIG.WIDTH - POPOVER_CONFIG.EDGE_MARGIN;
    const x = Math.min(Math.max(centeredX, workArea.x + POPOVER_CONFIG.EDGE_MARGIN), maxX);
    const y = Math.max(anchorBounds.y + anchorBounds.height + POPOVER_CONFIG.TOP_GAP, workArea.y + POPOVER_CONFIG.EDGE_MARGIN);

    return {
      x,
      y,
      width: POPOVER_CONFIG.WIDTH,
      height: POPOVER_CONFIG.HEIGHT,
    };
  }
}

export const menubarPopoverWindow = new MenubarPopoverWindowManager();
