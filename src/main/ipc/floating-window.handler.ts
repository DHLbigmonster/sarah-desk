/**
 * Floating Window IPC handlers.
 * Handles show/hide requests from the renderer process.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { floatingWindow } from '../windows';

/**
 * Setup floating window IPC handlers.
 */
export function setupFloatingWindowHandlers(): void {
  // Handle show request
  ipcMain.handle(IPC_CHANNELS.FLOATING_WINDOW.SHOW, () => {
    floatingWindow.show();
    return { success: true };
  });

  // Handle hide request
  ipcMain.handle(IPC_CHANNELS.FLOATING_WINDOW.HIDE, () => {
    floatingWindow.hide();
    return { success: true };
  });

  // Handle content height update for adaptive window sizing
  // Use ipcMain.on (not handle) since this is a fire-and-forget message
  ipcMain.on(IPC_CHANNELS.FLOATING_WINDOW.SET_CONTENT_HEIGHT, (_, height: number) => {
    floatingWindow.setContentHeight(height);
  });

  ipcMain.on(IPC_CHANNELS.FLOATING_WINDOW.SET_AUDIO_LEVEL, (_, level: number) => {
    floatingWindow.sendAudioLevel(level);
  });
}
