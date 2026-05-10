import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { localToolsService } from '../services/local-tools';
import type {
  LocalToolApprovalScope,
  LocalToolExecutionRequest,
  LocalToolId,
} from '../../shared/types/local-tools';

export function setupLocalToolsHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_TOOLS.GET_SNAPSHOT,
    async () => localToolsService.getSnapshot(),
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_TOOLS.SET_APPROVAL,
    async (_event, payload: { toolId: LocalToolId; capabilityId: string; scope: LocalToolApprovalScope }) =>
      localToolsService.setApproval(payload.toolId, payload.capabilityId, payload.scope),
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_TOOLS.REVOKE_APPROVAL,
    async (_event, payload: { toolId: LocalToolId; capabilityId: string }) =>
      localToolsService.revokeApproval(payload.toolId, payload.capabilityId),
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_TOOLS.EXECUTE,
    async (_event, request: LocalToolExecutionRequest) =>
      localToolsService.execute(request),
  );
}
