/**
 * Shared IPC API type contracts.
 *
 * These types define the shape of the API exposed to renderer processes
 * via contextBridge. Both preload.ts and Global.d.ts reference these types
 * so that any mismatch is caught at compile time.
 */

import type { ASRConfig, ASRResult, ASRStatus } from './asr';
import type { VoiceOverlayState } from './push-to-talk';
import type {
  AgentContext,
  AgentStreamChunk,
  AgentContextReadyPayload,
  AgentMessage,
  DailySummary,
  PersistedSession,
} from './agent';
import type { ClawDeskStatus } from './clawdesk';
import type {
  ClawDeskCliToolStatus,
  ClawDeskSkillDetail,
  ClawDeskSettingsOverview,
  ClawDeskThemeMode,
  HotkeyConfig,
  HotkeyCheckResult,
  OpenClawStatus,
} from './clawdesk-settings';
import type { MiniStatus } from './mini';
import type {
  LocalToolApprovalScope,
  LocalToolExecutionRequest,
  LocalToolExecutionResult,
  LocalToolId,
  LocalToolsSnapshot,
} from './local-tools';

export interface ASRApi {
  start: (config?: Partial<ASRConfig>) => Promise<{ success: boolean }>;
  stop: () => Promise<{ success: boolean }>;
  sendAudio: (chunk: ArrayBuffer) => void;
  onResult: (callback: (result: ASRResult) => void) => () => void;
  onLevel: (callback: (level: number) => void) => () => void;
  onStatus: (callback: (status: ASRStatus) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
}

export interface FloatingWindowApi {
  show: () => Promise<{ success: boolean }>;
  hide: () => Promise<{ success: boolean }>;
  setContentHeight: (height: number) => void;
  setAudioLevel: (level: number) => void;
}

export interface AgentApi {
  hide: () => Promise<{ success: boolean }>;
  sendInstruction: (instruction: string, context: AgentContext) => Promise<{ success: boolean }>;
  abort: () => Promise<{ success: boolean }>;
  notifyFirstChunkVisible: () => void;
  onShow: (callback: (payload: AgentContextReadyPayload) => void) => () => void;
  onStreamChunk: (callback: (chunk: AgentStreamChunk) => void) => () => void;
  onStreamDone: (callback: () => void) => () => void;
  onStreamError: (callback: (error: string) => void) => () => void;
  onSttResult: (callback: (text: string) => void) => () => void;
  onExternalSubmit: (callback: (payload: { instruction: string; context: AgentContext }) => void) => () => void;
  onShowResult: (
    callback: (payload: { transcript: string; context: AgentContext; result: string; isError: boolean }) => void,
  ) => () => void;
  saveSession: (messages: AgentMessage[]) => Promise<{ success: boolean }>;
  getTodaySession: () => Promise<PersistedSession | null>;
  getDailySummaries: () => Promise<DailySummary[]>;
  onDailySummaryReady: (callback: (summary: DailySummary) => void) => () => void;
}

export interface PushToTalkApi {
  cancel: () => void;
  confirm: () => void;
  onState: (callback: (state: VoiceOverlayState) => void) => () => void;
}

export interface ClawDeskApi {
  getStatus: () => Promise<ClawDeskStatus>;
  refreshStatus: () => Promise<ClawDeskStatus>;
  getWorkspaceTarget: () => Promise<{ success: boolean; url?: string; error?: string }>;
  showHome: () => Promise<{ success: boolean }>;
  getSettingsOverview: () => Promise<ClawDeskSettingsOverview>;
  getThemeMode: () => Promise<ClawDeskThemeMode>;
  setThemeMode: (themeMode: ClawDeskThemeMode) => Promise<ClawDeskThemeMode>;
  detectCliTools: () => Promise<ClawDeskCliToolStatus[]>;
  getSkillDetail: (skillId: string) => Promise<ClawDeskSkillDetail>;
  saveSkillContent: (skillId: string, content: string) => Promise<ClawDeskSkillDetail>;
  openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
  getHotkeyConfig: () => Promise<HotkeyConfig>;
  saveHotkeyConfig: (config: HotkeyConfig) => Promise<{ success: boolean; error?: string }>;
  checkToggleWindow: (accelerator: string) => Promise<HotkeyCheckResult>;
  voiceInputToggle: () => Promise<{ recording: boolean; error?: string } | { text?: string; error?: string }>;
  voiceInputStop: () => Promise<{ text?: string; error?: string }>;
  getConfigKeys: (provider: 'voice' | 'text') => Promise<Record<string, string>>;
  setConfigKey: (key: string, value: string) => Promise<{ success: boolean }>;
  deleteConfigKey: (key: string) => Promise<{ success: boolean }>;
  getOpenClawStatus: () => Promise<OpenClawStatus>;
}

export interface MiniApi {
  getStatus: () => Promise<MiniStatus>;
  hidePopover: () => Promise<{ success: boolean }>;
  showSettings: () => Promise<{ success: boolean }>;
  openPermissions: () => Promise<{ success: boolean }>;
  toggleDictation: () => Promise<{ success: boolean }>;
  toggleCommand: () => Promise<{ success: boolean }>;
  quit: () => Promise<{ success: boolean }>;
  showLogs: () => Promise<{ success: boolean; error?: string }>;
  testRecorderWindow: () => Promise<{ success: boolean; detail: string }>;
  testIpc: () => Promise<{ success: boolean; detail: string }>;
  testAsrMock: () => Promise<{ success: boolean; detail: string }>;
  testTextInsertMock: () => Promise<{ success: boolean; detail: string }>;
  signalRecorderReady: () => void;
  onRecorderPing: (callback: (nonce: string) => void) => () => void;
  sendRecorderPong: (nonce: string) => void;
}

export interface LocalToolsApi {
  getSnapshot: () => Promise<LocalToolsSnapshot>;
  setApproval: (
    toolId: LocalToolId,
    capabilityId: string,
    scope: LocalToolApprovalScope,
  ) => Promise<LocalToolsSnapshot>;
  revokeApproval: (
    toolId: LocalToolId,
    capabilityId: string,
  ) => Promise<LocalToolsSnapshot>;
  execute: (request: LocalToolExecutionRequest) => Promise<LocalToolExecutionResult>;
}

export interface AppApi {
  asr: ASRApi;
  floatingWindow: FloatingWindowApi;
  agent: AgentApi;
  pushToTalk: PushToTalkApi;
  clawDesk: ClawDeskApi;
  localTools: LocalToolsApi;
  mini: MiniApi;
}
