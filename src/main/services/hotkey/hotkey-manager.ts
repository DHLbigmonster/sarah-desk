/**
 * HotkeyManager — owns all globalShortcut registrations and coordinates
 * with VoiceModeManager when the user changes their hotkey config.
 */

import { globalShortcut } from 'electron';
import log from 'electron-log';
import { clawDeskSettingsService } from '../clawdesk/settings.service';
import { permissionsService } from '../permissions';
import { voiceModeManager } from '../push-to-talk/voice-mode-manager';
import { miniSettingsWindow } from '../../windows';
import {
  VOICE_TRIGGER_KEY_LABELS,
  VOICE_TRIGGER_KEY_UIOHOOK_MAP,
  resolveTriggerKeycode,
  type HotkeyConfig,
  type HotkeyCheckResult,
} from '../../../shared/types/clawdesk-settings';

const logger = log.scope('hotkey-manager');
const MAX_UIOHOOK_KEYCODE = 65535;
const DISALLOWED_TRIGGER_KEYCODES = new Map<number, string>([
  [1, 'Esc is reserved for cancel/close flows.'],
  [14, 'Backspace is a normal editing key.'],
  [15, 'Tab is a normal navigation key.'],
  [28, 'Return is a normal editing key.'],
  [42, 'Left Shift cannot be used as the base trigger.'],
  [54, 'Right Shift cannot be used as the base trigger.'],
  [56, 'Left Alt is used by many app shortcuts.'],
  [57, 'Space is already used for the Quick Ask chord.'],
  [29, 'Left Ctrl is used by system and app shortcuts.'],
  [55, 'Left Command is used by system and app shortcuts.'],
  [58, 'Caps Lock can be selected from the preset key list.'],
]);
const PRINTABLE_KEYCODE_RANGES: Array<[number, number]> = [
  [2, 13], // number row
  [16, 27], // Q-P
  [30, 41], // A-L and punctuation
  [43, 53], // Z-M and punctuation
];

function isPrintableKeycode(keycode: number): boolean {
  return PRINTABLE_KEYCODE_RANGES.some(([min, max]) => keycode >= min && keycode <= max);
}

function keyNameForConfig(config: HotkeyConfig): string {
  if (config.voiceTriggerKey === 'custom') {
    return `custom keycode ${config.customKeycode ?? '?'}`;
  }
  return VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey;
}

class HotkeyManager {
  private currentToggleWindow = '';

  getConfig(): HotkeyConfig {
    return clawDeskSettingsService.getHotkeyConfig();
  }

  /** Called once during app ready — reads persisted config and registers globalShortcut. */
  init(): void {
    const config = clawDeskSettingsService.getHotkeyConfig();
    this.currentToggleWindow = config.toggleWindow;
    this.registerToggleWindow(config.toggleWindow);
    voiceModeManager.initialize(config);
    logger.info('HotkeyManager initialized', config);
  }

  /** Apply a new config: re-initialize voice modes + re-register toggle window. */
  apply(config: HotkeyConfig): { success: boolean; error?: string } {
    if (voiceModeManager.isRecording) {
      return { success: false, error: '录音进行中，请结束后再修改热键' };
    }
    const voiceTriggerCheck = this.checkVoiceTrigger(config);
    if (!voiceTriggerCheck.isValid) {
      return {
        success: false,
        error: voiceTriggerCheck.conflicts.map((conflict) => conflict.message).join(' '),
      };
    }

    const previousConfig = clawDeskSettingsService.getHotkeyConfig();
    const previousToggleWindow = this.currentToggleWindow || previousConfig.toggleWindow;
    const accessibilityGranted = permissionsService.getAccessibilityStatus();
    const toggleWindowChanged = config.toggleWindow !== previousToggleWindow;
    const voiceTriggerChanged = config.voiceTriggerKey !== previousConfig.voiceTriggerKey
      || config.customKeycode !== previousConfig.customKeycode;

    try {
      if (toggleWindowChanged) {
        if (previousToggleWindow) {
          globalShortcut.unregister(previousToggleWindow);
        }

        const registered = this.registerToggleWindow(config.toggleWindow);
        if (!registered) {
          if (previousToggleWindow) {
            this.registerToggleWindow(previousToggleWindow);
          }
          this.currentToggleWindow = previousToggleWindow;
          logger.warn('HotkeyManager: rejected toggle shortcut', {
            requested: config.toggleWindow,
            restored: previousToggleWindow,
          });
          return { success: false, error: `无法注册快捷键 "${config.toggleWindow}"，已还原` };
        }
        this.currentToggleWindow = config.toggleWindow;
      }

      if (voiceTriggerChanged) {
        if (accessibilityGranted) {
          voiceModeManager.dispose();
          voiceModeManager.initialize(config);
        } else {
          logger.warn('Accessibility not granted — deferring voice trigger rebind', {
            requested: config.voiceTriggerKey,
          });
        }
      }

      clawDeskSettingsService.setHotkeyConfig(config);
      logger.info('HotkeyManager: config applied', {
        ...config,
        accessibilityGranted,
      });
      return { success: true };
    } catch (error) {
      if (toggleWindowChanged) {
        globalShortcut.unregister(config.toggleWindow);
        if (previousToggleWindow) {
          this.registerToggleWindow(previousToggleWindow);
        }
        this.currentToggleWindow = previousToggleWindow;
      }

      if (voiceTriggerChanged && accessibilityGranted) {
        try {
          voiceModeManager.dispose();
          voiceModeManager.initialize(previousConfig);
        } catch (rollbackError) {
          logger.error('HotkeyManager: failed to roll back voice trigger key', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }

      logger.error('HotkeyManager: failed to apply config', {
        error: error instanceof Error ? error.message : String(error),
        requested: config,
        restored: previousConfig,
      });
      clawDeskSettingsService.setHotkeyConfig(previousConfig);
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: '应用热键设置时发生未知错误' };
    }
  }

  async checkToggleWindow(accelerator: string): Promise<HotkeyCheckResult> {
    return clawDeskSettingsService.checkToggleWindowConflict(accelerator, this.currentToggleWindow);
  }

  checkVoiceTrigger(config: HotkeyConfig): HotkeyCheckResult {
    const conflicts: HotkeyCheckResult['conflicts'] = [];
    const keycode = resolveTriggerKeycode(config);

    if (!Number.isInteger(keycode) || keycode <= 0 || keycode > MAX_UIOHOOK_KEYCODE) {
      conflicts.push({
        type: 'invalid_format',
        message: '自定义热键必须是有效的 uiohook keycode。',
      });
      return { conflicts, isValid: false };
    }

    if (config.voiceTriggerKey === 'custom' && config.customKeycode == null) {
      conflicts.push({
        type: 'invalid_format',
        message: '请先录入一个按键或填写 keycode。',
      });
    }

    const knownPreset = Object.entries(VOICE_TRIGGER_KEY_UIOHOOK_MAP)
      .find(([, presetKeycode]) => presetKeycode === keycode)?.[0];
    if (config.voiceTriggerKey === 'custom' && knownPreset) {
      conflicts.push({
        type: 'already_registered',
        message: `${keyNameForConfig(config)} 已经是内置热键 ${VOICE_TRIGGER_KEY_LABELS[knownPreset as keyof typeof VOICE_TRIGGER_KEY_LABELS]}，请直接选择内置按钮。`,
      });
    }

    const reservedReason = DISALLOWED_TRIGGER_KEYCODES.get(keycode);
    if (reservedReason && config.voiceTriggerKey === 'custom') {
      conflicts.push({
        type: 'system_reserved',
        message: `${keyNameForConfig(config)} 不建议作为主触发键：${reservedReason}`,
      });
    }

    if (config.voiceTriggerKey === 'custom' && isPrintableKeycode(keycode)) {
      conflicts.push({
        type: 'unsafe_text_key',
        message: `${keyNameForConfig(config)} 是普通输入按键，会和打字冲突。请选择右侧修饰键、功能键或外接按钮。`,
      });
    }

    return { conflicts, isValid: conflicts.length === 0 };
  }

  private registerToggleWindow(accelerator: string): boolean {
    const registered = globalShortcut.register(accelerator, () => miniSettingsWindow.show());
    if (registered) {
      logger.info('Toggle window shortcut registered', { accelerator });
    } else {
      logger.warn('Failed to register toggle window shortcut', { accelerator });
    }
    return registered;
  }
}

export const hotkeyManager = new HotkeyManager();
