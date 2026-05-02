import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { localToolsService } from '../services/local-tools';

export function setupLocalToolsHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_TOOLS.GET_SNAPSHOT,
    async () => localToolsService.getSnapshot(),
  );
}
