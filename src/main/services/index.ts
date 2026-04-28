/**
 * Services module exports.
 * Re-exports all main process services.
 */

// ASR Service
export {
  ASRService,
  asrService,
  startASR,
  stopASR,
  getASRStatus,
  VolcengineClient,
  loadASRConfig,
  isASRConfigured,
  ConfigurationError,
  VOLCENGINE_CONSTANTS,
} from './asr';

export type {
  ASRServiceEvents,
  StartASRResponse,
  StopASRResponse,
  VolcengineClientEvents,
  ASREnvConfig,
  VolcengineClientConfig,
  ConnectionState,
} from './asr';

// Keyboard Service
export { KeyboardService, keyboardService } from './keyboard';
export type { TriggerConfig } from './keyboard';

// Text Input Service
export { TextInputService, textInputService } from './text-input';
export type { TextInsertResult } from './text-input';

// Permissions Service
export { PermissionsService, permissionsService } from './permissions';
export type { PermissionStatus, PermissionType, MediaAccessStatus } from './permissions';

// Voice Mode Service
export { VoiceModeManager, voiceModeManager } from './push-to-talk';
export type { VoiceState } from './push-to-talk';
