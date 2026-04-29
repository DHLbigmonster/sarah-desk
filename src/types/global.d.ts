/**
 * Global type declarations for the Electron application.
 * Extends the Window interface with the exposed API.
 */

import type { ASRConfig, ASRResult, ASRStatus } from '../shared/types/asr';
import type { VoiceOverlayState } from '../shared/types/push-to-talk';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type {
  AgentContext,
  AgentStreamChunk,
  AgentContextReadyPayload,
  AgentMessage,
  DailySummary,
  PersistedSession,
} from '../shared/types/agent';
import type { ClawDeskStatus } from '../shared/types/clawdesk';
import type {
  ClawDeskCliToolStatus,
  ClawDeskSkillDetail,
  ClawDeskSettingsOverview,
  ClawDeskThemeMode,
  HotkeyConfig,
  HotkeyCheckResult,
  OpenClawStatus,
} from '../shared/types/clawdesk-settings';
import type { MiniStatus } from '../shared/types/mini';

interface ASRApi {
  start: (config?: Partial<ASRConfig>) => Promise<{ success: boolean }>;
  stop: () => Promise<{ success: boolean }>;
  sendAudio: (chunk: ArrayBuffer) => void;
  onResult: (callback: (result: ASRResult) => void) => () => void;
  onLevel: (callback: (level: number) => void) => () => void;
  onStatus: (callback: (status: ASRStatus) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
}

interface FloatingWindowApi {
  show: () => Promise<{ success: boolean }>;
  hide: () => Promise<{ success: boolean }>;
  setContentHeight: (height: number) => void;
  setAudioLevel: (level: number) => void;
}

/**
 * Agent API interface exposed via contextBridge.
 */
interface AgentApi {
  /** Hide the agent window */
  hide: () => Promise<{ success: boolean }>;
  /** Send user instruction + context to main process */
  sendInstruction: (instruction: string, context: AgentContext) => Promise<{ success: boolean }>;
  /** Abort the current running agent task */
  abort: () => Promise<{ success: boolean }>;
  /** Notify main that answer overlay received first visible chunk */
  notifyFirstChunkVisible: () => void;
  /** Subscribe to window-show events (fires with context when window opens) */
  onShow: (callback: (payload: AgentContextReadyPayload) => void) => () => void;
  /** Subscribe to streamed text chunks */
  onStreamChunk: (callback: (chunk: AgentStreamChunk) => void) => () => void;
  /** Subscribe to turn-complete events */
  onStreamDone: (callback: () => void) => () => void;
  /** Subscribe to error events */
  onStreamError: (callback: (error: string) => void) => () => void;
  /** Subscribe to STT transcript results */
  onSttResult: (callback: (text: string) => void) => () => void;
  /** Subscribe to external voice instructions that should appear in chat and auto-run */
  onExternalSubmit: (callback: (payload: { instruction: string; context: AgentContext }) => void) => () => void;
  /** Subscribe to buffered Command-mode result display (no re-exec) */
  onShowResult: (
    callback: (payload: { transcript: string; context: AgentContext; result: string; isError: boolean }) => void,
  ) => () => void;
  /** Save today's chat messages to disk */
  saveSession: (messages: AgentMessage[]) => Promise<{ success: boolean }>;
  /** Load today's persisted session (null if none) */
  getTodaySession: () => Promise<PersistedSession | null>;
  /** Get all daily summaries */
  getDailySummaries: () => Promise<DailySummary[]>;
  /** Subscribe to daily summary ready events (fires after background consolidation) */
  onDailySummaryReady: (callback: (summary: DailySummary) => void) => () => void;
}

interface PushToTalkApi {
  cancel: () => void;
  confirm: () => void;
  onState: (callback: (state: VoiceOverlayState) => void) => () => void;
}

interface ClawDeskApi {
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

interface MiniApi {
  getStatus: () => Promise<MiniStatus>;
  showLogs: () => Promise<{ success: boolean; error?: string }>;
  testRecorderWindow: () => Promise<{ success: boolean; detail: string }>;
  testIpc: () => Promise<{ success: boolean; detail: string }>;
  testAsrMock: () => Promise<{ success: boolean; detail: string }>;
  testTextInsertMock: () => Promise<{ success: boolean; detail: string }>;
  signalRecorderReady: () => void;
  onRecorderPing: (callback: (nonce: string) => void) => () => void;
  sendRecorderPong: (nonce: string) => void;
}

interface AppApi {
  asr: ASRApi;
  floatingWindow: FloatingWindowApi;
  agent: AgentApi;
  pushToTalk: PushToTalkApi;
  clawDesk: ClawDeskApi;
  mini: MiniApi;
}

declare global {
  interface Window {
    api: AppApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: boolean;
        partition?: string;
        webpreferences?: string;
      };
    }
  }
}

export {};
