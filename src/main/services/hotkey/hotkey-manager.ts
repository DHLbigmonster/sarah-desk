/**
 * HotkeyManager — owns all globalShortcut registrations and coordinates
 * with VoiceModeManager when the user changes their hotkey config.
 */

import { globalShortcut } from 'electron';
import log from 'electron-log';
import { clawDeskSettingsService } from '../clawdesk/settings.service';
import { permissionsService } from '../permissions';
import { voiceModeManager } from '../push-to-talk/voice-mode-manager';
import { clawDeskMainWindow } from '../../windows';
import type { HotkeyConfig, HotkeyCheckResult } from '../../../shared/types/clawdesk-settings';

const logger = log.scope('hotkey-manager');

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

  private registerToggleWindow(accelerator: string): boolean {
    const registered = globalShortcut.register(accelerator, () => clawDeskMainWindow.toggle());
    if (registered) {
      logger.info('Toggle window shortcut registered', { accelerator });
    } else {
      logger.warn('Failed to register toggle window shortcut', { accelerator });
    }
    return registered;
  }
}

export const hotkeyManager = new HotkeyManager();
