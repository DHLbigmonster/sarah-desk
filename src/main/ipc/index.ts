/**
 * IPC handler registration.
 * Central place to register all IPC handlers.
 */

import { setupASRHandlers } from './asr.handler';
import { setupFloatingWindowHandlers } from './floating-window.handler';
import { setupAgentHandlers } from './agent.handler';
import { setupPushToTalkHandlers } from './push-to-talk.handler';
import { setupClawDeskHandlers } from './claw-desk.handler';
import { setupLocalToolsHandlers } from './local-tools.handler';

/**
 * Setup all IPC handlers.
 * Call this during app initialization, before creating windows.
 */
export function setupAllIpcHandlers(): void {
  setupASRHandlers();
  setupFloatingWindowHandlers();
  setupAgentHandlers();
  setupPushToTalkHandlers();
  setupClawDeskHandlers();
  setupLocalToolsHandlers();
}
