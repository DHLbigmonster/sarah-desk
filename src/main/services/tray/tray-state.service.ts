/**
 * TrayStateService — manages the tray icon's visual state for Command mode.
 *
 * States:
 *   idle          → default template icon (tintable by macOS menu bar)
 *   processing    → red dot icon + title "●" (Command task is running)
 *   done-unread   → green dot icon + title "●" (Command task finished, user hasn't viewed result)
 *
 * macOS tradeoff: template icons auto-tint but can't show real colors.
 * For processing / done-unread we swap to non-template colored PNGs.
 * The tray title is set as a secondary monochrome channel.
 */

import { Tray, nativeImage, type NativeImage } from 'electron';
import log from 'electron-log';

const logger = log.scope('tray-state');

export type TrayState = 'idle' | 'processing' | 'done-unread';

// 22×22 RGBA PNG: filled ~10px circle centered, red #E53935
const RED_DOT_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAWElEQVR4nGN4amnKQAtME0NHDR48BkcB8UEg/gHFB6FiFBncA8T/ceAecg2OwmMoDON0OT6DDxJh8EFyDP5BhME/BpXBNAsKmkUezZIbTTMI2XjU4CFsMAAoUM+Xwek7ZQAAAABJRU5ErkJggg==';

// 22×22 RGBA PNG: filled ~10px circle centered, green #43A047
const GREEN_DOT_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAWElEQVR4nGNwXuDOQAtME0NHDR48BkcB8UEg/gHFB6FiFBncA8T/ceAecg2OwmMoDON0OT6DDxJh8EFyDP5BhME/BpXBNAsKmkUezZIbTTMI2XjU4CFsMAAr/IITV2eJiQAAAABJRU5ErkJggg==';

function buildColoredIcon(base64: string): NativeImage {
  const img = nativeImage.createFromDataURL(`data:image/png;base64,${base64}`);
  // Explicitly non-template so macOS renders the real color.
  img.setTemplateImage(false);
  return img;
}

class TrayStateService {
  private tray: Tray | null = null;
  private idleIcon: NativeImage | null = null;
  private redIcon: NativeImage | null = null;
  private greenIcon: NativeImage | null = null;
  private state: TrayState = 'idle';

  attach(tray: Tray, idleIcon: NativeImage): void {
    this.tray = tray;
    this.idleIcon = idleIcon;
    this.redIcon = buildColoredIcon(RED_DOT_BASE64);
    this.greenIcon = buildColoredIcon(GREEN_DOT_BASE64);
    this.apply();
  }

  getState(): TrayState {
    return this.state;
  }

  setState(state: TrayState): void {
    if (this.state === state) return;
    this.state = state;
    logger.info('TrayState set', { state });
    this.apply();
  }

  private apply(): void {
    if (!this.tray) return;
    switch (this.state) {
      case 'idle':
        if (this.idleIcon) this.tray.setImage(this.idleIcon);
        this.tray.setTitle('');
        break;
      case 'processing':
        if (this.redIcon) this.tray.setImage(this.redIcon);
        // Secondary monochrome channel — visible alongside the icon.
        this.tray.setTitle(' ●');
        break;
      case 'done-unread':
        if (this.greenIcon) this.tray.setImage(this.greenIcon);
        this.tray.setTitle(' ●');
        break;
    }
  }
}

export const trayStateService = new TrayStateService();
