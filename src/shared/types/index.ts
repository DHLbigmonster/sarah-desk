/**
 * Shared type definitions.
 * Re-exports all types for convenient importing.
 */

export type {
  ASRConfig,
  ASRResult,
  ASRStatus,
  AudioChunk,
} from './asr';

export type {
  AgentContext,
  AgentMessage,
  AgentStatus,
  AgentStreamChunk,
  AgentContextReadyPayload,
} from './agent';

export type {
  AppApi,
  ASRApi,
  FloatingWindowApi,
  AgentApi,
  PushToTalkApi,
  ClawDeskApi,
  LocalToolsApi,
  MiniApi,
} from './ipc-api';

export type {
  LocalToolCapability,
  LocalToolsSnapshot,
  LocalToolStatus,
} from './local-tools';
