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

export interface ClawDeskSettingsOverview {
  themeMode: ClawDeskThemeMode;
  versionInfo: ClawDeskVersionInfo;
  providers: ClawDeskProviderSummaryItem[];
  skills: ClawDeskSkillItem[];
  cliCatalog: ClawDeskCliToolDefinition[];
}

// ── Hotkey customization ──────────────────────────────────────────────────────

export type VoiceTriggerKey = 'CtrlRight' | 'AltRight';

export const VOICE_TRIGGER_KEY_LABELS: Record<VoiceTriggerKey, string> = {
  CtrlRight: 'Right Ctrl',
  AltRight: 'Right Alt (Option)',
};

export interface HotkeyConfig {
  voiceTriggerKey: VoiceTriggerKey;
  toggleWindow: string; // Electron Accelerator, e.g. 'CommandOrControl+Shift+Space'
}

export const DEFAULT_HOTKEY_CONFIG: HotkeyConfig = {
  voiceTriggerKey: 'CtrlRight',
  toggleWindow: 'CommandOrControl+Shift+Space',
};

export interface HotkeyConflict {
  type: 'system_reserved' | 'already_registered' | 'invalid_format';
  message: string;
}

export interface HotkeyCheckResult {
  conflicts: HotkeyConflict[];
  isValid: boolean;
}
