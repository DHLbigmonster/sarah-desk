import type { ASRStatus } from './asr';

export type MiniVoiceState =
  | 'idle'
  | 'dictation_recording'
  | 'command_recording'
  | 'quickask_recording';

export interface MiniProviderStatus {
  name: string;
  configured: boolean;
  detail: string;
}

export interface MiniHotkeyStatus {
  accessibilityGranted: boolean;
  keyboardHookActive: boolean;
  currentVoiceState: MiniVoiceState;
}

export interface MiniRecorderStatus {
  created: boolean;
  ready: boolean;
  asrStatus: ASRStatus;
}

export interface MiniGatewayStatus {
  url: string;
  state: 'loading' | 'connected' | 'offline' | 'unknown';
  detail: string;
}

export interface MiniStatus {
  mode: 'mini';
  gateway: MiniGatewayStatus;
  asrProvider: MiniProviderStatus;
  refinementProvider: MiniProviderStatus;
  hotkeys: MiniHotkeyStatus;
  recorder: MiniRecorderStatus;
}
