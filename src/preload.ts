/**
 * Preload script for Electron.
 * Exposes a safe API to the renderer process via contextBridge.
 *
 * See the Electron documentation for details on how to use preload scripts:
 * https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/constants/channels';
import type { ASRConfig, ASRResult, ASRStatus } from './shared/types/asr';
import type { VoiceOverlayState } from './shared/types/push-to-talk';
import type {
  AgentContext,
  AgentStreamChunk,
  AgentContextReadyPayload,
  AgentMessage,
  DailySummary,
  PersistedSession,
} from './shared/types/agent';
import type { ClawDeskStatus } from './shared/types/clawdesk';
import type {
  ClawDeskCliToolStatus,
  ClawDeskSkillDetail,
  ClawDeskSettingsOverview,
  ClawDeskThemeMode,
  HotkeyConfig,
  HotkeyCheckResult,
} from './shared/types/clawdesk-settings';
import type { MiniStatus } from './shared/types/mini';

/**
 * ASR API exposed to the renderer process.
 */
const asrApi = {
  start: (config?: Partial<ASRConfig>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR.START, config),

  stop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR.STOP),

  sendAudio: (chunk: ArrayBuffer): void => {
    ipcRenderer.send(IPC_CHANNELS.ASR.SEND_AUDIO, chunk);
  },

  onResult: (callback: (result: ASRResult) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: ASRResult): void => {
      callback(result);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.RESULT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR.RESULT, handler);
  },

  onLevel: (callback: (level: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, level: number): void => {
      callback(level);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.LEVEL, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR.LEVEL, handler);
  },

  onStatus: (callback: (status: ASRStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ASRStatus): void => {
      callback(status);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR.STATUS, handler);
  },

  onError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => {
      callback(error);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR.ERROR, handler);
  },
};

/**
 * Floating Window API exposed to the renderer process.
 */
const floatingWindowApi = {
  show: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLOATING_WINDOW.SHOW),

  hide: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLOATING_WINDOW.HIDE),

  setContentHeight: (height: number): void => {
    ipcRenderer.send(IPC_CHANNELS.FLOATING_WINDOW.SET_CONTENT_HEIGHT, height);
  },

  setAudioLevel: (level: number): void => {
    ipcRenderer.send(IPC_CHANNELS.FLOATING_WINDOW.SET_AUDIO_LEVEL, level);
  },
};

/**
 * Agent API exposed to the renderer process.
 */
const agentApi = {
  /**
   * Hide/close the agent window.
   */
  hide: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT.HIDE),

  /**
   * Send a user instruction to the main process for execution.
   */
  sendInstruction: (
    instruction: string,
    context: AgentContext,
  ): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT.SEND_INSTRUCTION, { instruction, context }),

  /**
   * Abort the currently running agent task.
   */
  abort: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT.ABORT),

  /**
   * Notify main that answer overlay received first visible chunk.
   */
  notifyFirstChunkVisible: (): void => {
    ipcRenderer.send(IPC_CHANNELS.AGENT.FIRST_CHUNK_VISIBLE);
  },

  /**
   * Subscribe to agent show events (main sends context when window opens).
   */
  onShow: (callback: (payload: AgentContextReadyPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentContextReadyPayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.SHOW, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.SHOW, handler);
  },

  /**
   * Subscribe to streaming text chunks from the claude CLI.
   */
  onStreamChunk: (callback: (chunk: AgentStreamChunk) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: AgentStreamChunk): void => {
      callback(chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.STREAM_CHUNK, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.STREAM_CHUNK, handler);
  },

  /**
   * Subscribe to agent turn completion.
   */
  onStreamDone: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on(IPC_CHANNELS.AGENT.STREAM_DONE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.STREAM_DONE, handler);
  },

  /**
   * Subscribe to agent errors.
   */
  onStreamError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => {
      callback(error);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.STREAM_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.STREAM_ERROR, handler);
  },

  /**
   * Subscribe to STT transcript results (voice input).
   */
  onSttResult: (callback: (text: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string): void => {
      callback(text);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.STT_RESULT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.STT_RESULT, handler);
  },

  /**
   * Subscribe to buffered Command-mode results (display only, no re-exec).
   */
  onShowResult: (
    callback: (payload: {
      transcript: string;
      context: AgentContext;
      result: string;
      isError: boolean;
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { transcript: string; context: AgentContext; result: string; isError: boolean },
    ): void => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.SHOW_RESULT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.SHOW_RESULT, handler);
  },

  /**
   * Subscribe to an externally-triggered voice instruction that should appear
   * in chat and be auto-submitted.
   */
  onExternalSubmit: (
    callback: (payload: { instruction: string; context: AgentContext }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { instruction: string; context: AgentContext },
    ): void => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.EXTERNAL_SUBMIT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.EXTERNAL_SUBMIT, handler);
  },

  /**
   * Save today's session messages to disk.
   */
  saveSession: (messages: AgentMessage[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT.SAVE_SESSION, messages),

  /**
   * Load today's persisted session (may be null on first open of the day).
   */
  getTodaySession: (): Promise<PersistedSession | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT.GET_TODAY_SESSION),

  /**
   * Get all daily summaries (newest first).
   */
  getDailySummaries: (): Promise<DailySummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT.GET_DAILY_SUMMARIES),

  /**
   * Subscribe to daily summary ready events (fires after background consolidation).
   */
  onDailySummaryReady: (callback: (summary: DailySummary) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, summary: DailySummary): void => {
      callback(summary);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT.DAILY_SUMMARY_READY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT.DAILY_SUMMARY_READY, handler);
  },
};

const pushToTalkApi = {
  cancel: (): void => { ipcRenderer.send(IPC_CHANNELS.PUSH_TO_TALK.CANCEL); },
  confirm: (): void => { ipcRenderer.send(IPC_CHANNELS.PUSH_TO_TALK.CONFIRM); },
  onState: (callback: (state: VoiceOverlayState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: VoiceOverlayState): void => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.PUSH_TO_TALK.STATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PUSH_TO_TALK.STATE, handler);
  },
};

const clawDeskApi = {
  getStatus: (): Promise<ClawDeskStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.GET_STATUS),

  refreshStatus: (): Promise<ClawDeskStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.REFRESH_STATUS),

  getWorkspaceTarget: (): Promise<{ success: boolean; url?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.GET_WORKSPACE_TARGET),

  showHome: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.SHOW_HOME),

  getSettingsOverview: (): Promise<ClawDeskSettingsOverview> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.GET_SETTINGS_OVERVIEW),

  getThemeMode: (): Promise<ClawDeskThemeMode> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.GET_THEME_MODE),

  setThemeMode: (themeMode: ClawDeskThemeMode): Promise<ClawDeskThemeMode> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.SET_THEME_MODE, themeMode),

  detectCliTools: (): Promise<ClawDeskCliToolStatus[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.DETECT_CLI_TOOLS),

  getSkillDetail: (skillId: string): Promise<ClawDeskSkillDetail> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.GET_SKILL_DETAIL, skillId),

  saveSkillContent: (skillId: string, content: string): Promise<ClawDeskSkillDetail> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.SAVE_SKILL_CONTENT, skillId, content),

  openPath: (targetPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.OPEN_PATH, targetPath),

  openExternal: (url: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.OPEN_EXTERNAL, url),

  getHotkeyConfig: (): Promise<HotkeyConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.GET_HOTKEY_CONFIG),

  saveHotkeyConfig: (config: HotkeyConfig): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.SAVE_HOTKEY_CONFIG, config),

  checkToggleWindow: (accelerator: string): Promise<HotkeyCheckResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.CHECK_TOGGLE_WINDOW, accelerator),

  voiceInputToggle: (): Promise<{ recording: boolean; error?: string } | { text?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.VOICE_INPUT_TOGGLE),

  voiceInputStop: (): Promise<{ text?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAW_DESK.VOICE_INPUT_STOP),
};

const miniApi = {
  getStatus: (): Promise<MiniStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.MINI.GET_STATUS),
  showLogs: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MINI.SHOW_LOGS),
  testRecorderWindow: (): Promise<{ success: boolean; detail: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MINI.TEST_RECORDER_WINDOW),
  testIpc: (): Promise<{ success: boolean; detail: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MINI.TEST_IPC),
  testAsrMock: (): Promise<{ success: boolean; detail: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MINI.TEST_ASR_MOCK),
  testTextInsertMock: (): Promise<{ success: boolean; detail: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MINI.TEST_TEXT_INSERT_MOCK),
  signalRecorderReady: (): void => {
    ipcRenderer.send(IPC_CHANNELS.MINI.RECORDER_READY);
  },
  onRecorderPing: (callback: (nonce: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, nonce: string): void => {
      callback(nonce);
    };
    ipcRenderer.on(IPC_CHANNELS.MINI.RECORDER_PING, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MINI.RECORDER_PING, handler);
  },
  sendRecorderPong: (nonce: string): void => {
    ipcRenderer.send(IPC_CHANNELS.MINI.RECORDER_PONG, nonce);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', {
  asr: asrApi,
  floatingWindow: floatingWindowApi,
  agent: agentApi,
  pushToTalk: pushToTalkApi,
  clawDesk: clawDeskApi,
  mini: miniApi,
});
