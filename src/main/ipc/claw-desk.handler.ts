import { ipcMain, shell } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { PROVIDER_KEYS, isValidProviderKey } from '../../shared/constants/provider-keys';
import type { ProviderId } from '../../shared/constants/provider-keys';
import { clawDeskMainWindow } from '../windows';
import { clawDeskSettingsService } from '../services/clawdesk/settings.service';
import { hotkeyManager } from '../services/hotkey/hotkey-manager';
import { asrService } from '../services/asr';
import { voiceModeManager } from '../services/push-to-talk';
import { credentialStore } from '../services/config/credential-store';
import type { HotkeyConfig } from '../../shared/types/clawdesk-settings';

const logger = log.scope('clawdesk-voice-input');

let clawDeskVoiceRecording = false;
let voiceTransition: Promise<unknown> | null = null;

export function setupClawDeskHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CLAW_DESK.GET_STATUS, async () => clawDeskMainWindow.getStatus());

  ipcMain.handle(IPC_CHANNELS.CLAW_DESK.REFRESH_STATUS, async () => clawDeskMainWindow.refreshStatus());

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.GET_WORKSPACE_TARGET,
    async () => clawDeskMainWindow.getWorkspaceTarget(),
  );

  ipcMain.handle(IPC_CHANNELS.CLAW_DESK.SHOW_HOME, async () => {
    clawDeskMainWindow.showHome();
    return { success: true };
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.GET_SETTINGS_OVERVIEW,
    async () => clawDeskSettingsService.getSettingsOverview(),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.GET_THEME_MODE,
    async () => clawDeskSettingsService.getThemeMode(),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.SET_THEME_MODE,
    async (_event, themeMode) => clawDeskSettingsService.setThemeMode(themeMode),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.DETECT_CLI_TOOLS,
    async () => clawDeskSettingsService.detectCliTools(),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.GET_SKILL_DETAIL,
    async (_event, skillId: string) => clawDeskSettingsService.getSkillDetail(skillId),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.SAVE_SKILL_CONTENT,
    async (_event, skillId: string, content: string) =>
      clawDeskSettingsService.saveSkillContent(skillId, content),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.OPEN_PATH,
    async (_event, targetPath: string) => {
      try {
        const error = await shell.openPath(targetPath);
        return { success: error === '', error: error || undefined };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.OPEN_EXTERNAL,
    async (_event, url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return { success: false, error: `Blocked non-http URL: ${parsed.protocol}` };
        }
        await shell.openExternal(url);
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.GET_HOTKEY_CONFIG,
    () => hotkeyManager.getConfig(),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.SAVE_HOTKEY_CONFIG,
    async (_event, config: HotkeyConfig) => {
      try {
        return hotkeyManager.apply(config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.CHECK_TOGGLE_WINDOW,
    async (_event, accelerator: string) => hotkeyManager.checkToggleWindow(accelerator),
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.VOICE_INPUT_TOGGLE,
    async () => {
      // Serialize concurrent toggle requests through a promise chain
      const prev = voiceTransition;
      let resolve!: () => void;
      voiceTransition = new Promise<void>((r) => { resolve = r; });
      if (prev) await prev;
      try {
        // Check and set the flag synchronously to prevent double-start race
        if (clawDeskVoiceRecording) {
          return await stopClawDeskVoice();
        }
        if (voiceModeManager.isRecording) {
          return { recording: false, error: '全局语音模式正在录音中，请稍后再试' };
        }
        clawDeskVoiceRecording = true;
        return await startClawDeskVoice();
      } catch (err) {
        clawDeskVoiceRecording = false;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('ClawDesk voice input: toggle failed', { error: msg });
        return { recording: false, error: msg };
      } finally {
        resolve();
        voiceTransition = null;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.VOICE_INPUT_STOP,
    async () => stopClawDeskVoice(),
  );

  // ── Config credential handlers ────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.CONFIG_GET_PROVIDER_KEYS,
    async (_event, provider: ProviderId) => {
      const keys = PROVIDER_KEYS[provider] ?? [];
      const result: Record<string, string> = {};
      for (const key of keys) {
        const val = credentialStore.get(key);
        if (val != null) {
          result[key] = val;
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.CONFIG_SET_PROVIDER_KEY,
    async (_event, key: string, value: string) => {
      if (!isValidProviderKey(key)) {
        return { success: false, error: `Unknown config key: ${key}` };
      }
      credentialStore.set(key, value);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.CONFIG_DELETE_PROVIDER_KEY,
    async (_event, key: string) => {
      if (!isValidProviderKey(key)) {
        return { success: false, error: `Unknown config key: ${key}` };
      }
      credentialStore.remove(key);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAW_DESK.GET_OPENCLAW_STATUS,
    async () => clawDeskSettingsService.getOpenClawStatus(),
  );
}

async function startClawDeskVoice(): Promise<{ recording: boolean; error?: string }> {
  // Flag is set synchronously by the toggle handler before calling this function.
  try {
    logger.info('ClawDesk voice input: start');
    await asrService.start();
    return { recording: true };
  } catch (err) {
    clawDeskVoiceRecording = false;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('ClawDesk voice input: start failed', { error: msg });
    return { recording: false, error: msg };
  }
}

async function stopClawDeskVoice(): Promise<{ text?: string; error?: string }> {
  if (!clawDeskVoiceRecording) {
    return {};
  }

  clawDeskVoiceRecording = false;
  logger.info('ClawDesk voice input: stop');

  try {
    const result = await asrService.stop();
    const text = result?.text?.trim() || undefined;
    logger.info('ClawDesk voice input: result', { textLength: text?.length ?? 0 });
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('ClawDesk voice input: stop failed', { error: msg });
    return { error: msg };
  }
}
