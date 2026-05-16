export type ClawDeskThemeMode = 'light' | 'dark' | 'system';

export interface ClawDeskVersionInfo {
  appVersion: string;
  packageVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  publishScriptAvailable: boolean;
  autoUpdateConfigured: boolean;
  productName: string;
  packageName: string;
  githubRepo: string | null;
}

export interface ClawDeskProviderSummaryItem {
  id: 'voice' | 'text';
  label: string;
  provider: string;
  detail: string;
  configured: boolean;
  statusLabel: string;
  envKeys: string[];
  envFilePath: string;
  envExamplePath: string;
  guidance: string[];
  documentationUrl: string | null;
  /** Where the config is sourced from: 'env' (.env file) or 'settings' (GUI-stored) */
  configSource?: 'env' | 'settings';
}

export interface ClawDeskSkillItem {
  id: string;
  name: string;
  description: string;
  path: string;
  source: 'codex' | 'agents' | 'openclaw';
  installed: boolean;
  commandName: string;
  editable: boolean;
}

export interface ClawDeskSkillDetail extends ClawDeskSkillItem {
  content: string;
  overview: string;
}

export interface ClawDeskCliToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  command: string;
  versionArgs: string[][];
  recommended: boolean;
  source: string;
  installCommand: string | null;
  detailIntro: string;
  docsUrl: string | null;
  repoUrl: string | null;
  authRequired: boolean;
  postInstallNotes: string[];
}

export interface ClawDeskCliToolStatus {
  id: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  checkedAt: number;
}

export interface OpenClawStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
}

export type AgentRuntimeId = 'openclaw' | 'hermes' | 'codex' | 'claude';

export interface AgentRuntimeStatus {
  id: AgentRuntimeId;
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
  ready: boolean;
  detail: string;
  setupHint: string | null;
}

export interface AgentRuntimeSelection {
  selected: AgentRuntimeId | null;
  effective: AgentRuntimeId | null;
  runtimes: AgentRuntimeStatus[];
}

export interface AgentRuntimeConnectResult {
  success: boolean;
  runtimeId: AgentRuntimeId;
  detail: string;
  selection: AgentRuntimeSelection;
}

export interface ClawDeskSettingsOverview {
  themeMode: ClawDeskThemeMode;
  versionInfo: ClawDeskVersionInfo;
  providers: ClawDeskProviderSummaryItem[];
  skills: ClawDeskSkillItem[];
  cliCatalog: ClawDeskCliToolDefinition[];
}

// ── Hotkey customization ──────────────────────────────────────────────────────

export type VoiceTriggerKey =
  | 'CtrlRight'
  | 'AltRight'
  | 'CapsLock'
  | 'MetaRight'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6'
  | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12'
  | 'F18' | 'F19'
  | 'custom';

export const VOICE_TRIGGER_KEY_LABELS: Record<VoiceTriggerKey, string> = {
  CtrlRight: 'Right Ctrl',
  AltRight: 'Right Alt (Option)',
  CapsLock: 'Caps Lock',
  MetaRight: 'Right Cmd',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  F18: 'F18', F19: 'F19',
  custom: '自定义…',
};

/** Maps VoiceTriggerKey to the uiohook-napi keycode used for registration. */
export const VOICE_TRIGGER_KEY_UIOHOOK_MAP: Record<Exclude<VoiceTriggerKey, 'custom'>, number> = {
  CtrlRight: 3613,
  AltRight: 3640,
  CapsLock: 58,
  MetaRight: 3676,
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  F18: 101, F19: 102,
};

/** Release-mode trigger keys: stable choices that avoid normal typing and hidden keycodes. */
export const SAFE_TRIGGER_KEYS: VoiceTriggerKey[] = [
  'AltRight', 'MetaRight', 'F18', 'F19',
];

export interface HotkeyConfig {
  voiceTriggerKey: VoiceTriggerKey;
  /** Uiohook keycode when voiceTriggerKey is 'custom'. Ignored otherwise. */
  customKeycode?: number;
  toggleWindow: string; // Electron Accelerator, e.g. 'CommandOrControl+Shift+Space'
}

export const DEFAULT_HOTKEY_CONFIG: HotkeyConfig = {
  voiceTriggerKey: 'AltRight',
  toggleWindow: 'CommandOrControl+Shift+Space',
};

export interface HotkeyConflict {
  type: 'system_reserved' | 'already_registered' | 'invalid_format' | 'unsafe_text_key';
  message: string;
}

export interface HotkeyCheckResult {
  conflicts: HotkeyConflict[];
  isValid: boolean;
}

/** Resolve the uiohook keycode from a HotkeyConfig. */
export function resolveTriggerKeycode(config: HotkeyConfig): number {
  if (config.voiceTriggerKey === 'custom') {
    return config.customKeycode ?? VOICE_TRIGGER_KEY_UIOHOOK_MAP.CtrlRight;
  }
  return VOICE_TRIGGER_KEY_UIOHOOK_MAP[config.voiceTriggerKey];
}

/** Get a human-readable label for the current trigger key config. */
export function getTriggerKeyLabel(config: HotkeyConfig): string {
  if (config.voiceTriggerKey === 'custom') {
    return `Custom (keycode ${config.customKeycode})`;
  }
  return VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey];
}
