import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { voiceModeManager } from '../services/push-to-talk/voice-mode-manager';

export function setupPushToTalkHandlers(): void {
  ipcMain.on(IPC_CHANNELS.PUSH_TO_TALK.CANCEL, () => {
    void voiceModeManager.cancel();
  });

  ipcMain.on(IPC_CHANNELS.PUSH_TO_TALK.CONFIRM, () => {
    void voiceModeManager.confirm();
  });
}
