import type { ASRStatus } from './asr';
import type { HotkeyConfig } from './clawdesk-settings';

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

export interface MiniPermissionStatus {
  microphone: 'granted' | 'not-determined' | 'denied' | 'restricted' | 'unknown';
  accessibility: boolean;
  screenRecording: 'granted' | 'not-determined' | 'denied' | 'restricted' | 'unknown';
  inputMonitoring: boolean;
}

export interface MiniHotkeyStatus {
  accessibilityGranted: boolean;
  keyboardHookActive: boolean;
  currentVoiceState: MiniVoiceState;
  hotkeyConfig: HotkeyConfig;
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

export interface MiniAgentStatus {
  available: boolean;
  binaryPath: string | null;
  detail: string;
}

export interface MiniStatus {
  mode: 'mini';
  gateway: MiniGatewayStatus;
  asrProvider: MiniProviderStatus;
  refinementProvider: MiniProviderStatus;
  agent: MiniAgentStatus;
  hotkeys: MiniHotkeyStatus;
  recorder: MiniRecorderStatus;
  permissions: MiniPermissionStatus;
}
