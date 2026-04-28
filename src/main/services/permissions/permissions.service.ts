/**
 * Permissions Service.
 * Handles macOS system permission checks and prompts.
 *
 * Required permissions for Push-to-Talk:
 * - Microphone:       Audio capture via getUserMedia (Web Audio API)
 * - Accessibility:    Text insertion via node-insert-text
 * - Input Monitoring: Global keyboard hooks via uiohook-napi
 * - Screen Recording: `screencapture` CLI used by Command-mode context capture
 *                     (macOS Sequoia+ requires this permission for any process
 *                     that calls `screencapture`)
 */

import { systemPreferences, shell, Notification } from 'electron';
import log from 'electron-log';

const logger = log.scope('permissions-service');

const SETTINGS_URLS = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
} as const;

export type PermissionType = keyof typeof SETTINGS_URLS;
export type MediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export interface PermissionStatus {
  microphone: MediaAccessStatus;
  accessibility: boolean;
  screenRecording: MediaAccessStatus;
  inputMonitoringCheckable: false;
  allGranted: boolean;
}

export class PermissionsService {
  checkPermissions(): PermissionStatus {
    const microphone = this.getMicrophoneStatus();
    const accessibility = this.getAccessibilityStatus();
    const screenRecording = this.getScreenRecordingStatus();
    // macOS does not expose Input Monitoring status to Electron.
    // Treat "allGranted" as false unless the user has manually verified it.
    const allGranted = false;
    logger.debug('Permission check result', { microphone, accessibility, screenRecording, allGranted });
    return { microphone, accessibility, screenRecording, inputMonitoringCheckable: false, allGranted };
  }

  getMicrophoneStatus(): MediaAccessStatus {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('microphone');
  }

  getAccessibilityStatus(promptIfNeeded = false): boolean {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.isTrustedAccessibilityClient(promptIfNeeded);
  }

  /**
   * Read-only check for Screen Recording permission.
   * Required by `screencapture` CLI on macOS Sequoia+.
   * There is no programmatic prompt — user must grant in System Settings,
   * then fully restart the app.
   */
  getScreenRecordingStatus(): MediaAccessStatus {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('screen');
  }

  async requestMicrophonePermission(): Promise<boolean> {
    if (process.platform !== 'darwin') return true;
    const status = this.getMicrophoneStatus();
    if (status === 'granted') return true;
    if (status === 'not-determined') {
      try {
        return await systemPreferences.askForMediaAccess('microphone');
      } catch (error) {
        logger.error('Failed to request microphone permission', { error });
        return false;
      }
    }
    return false;
  }

  openSettings(type: PermissionType): void {
    const url = SETTINGS_URLS[type];
    logger.info('Opening permission settings', { type, url });
    shell.openExternal(url).catch((error) => {
      logger.error('Failed to open settings', { type, error });
    });
  }

  /**
   * Run the full startup permission flow:
   *   1. Request microphone permission (shows system dialog first time)
   *   2. Prompt accessibility (opens System Settings if not granted)
   *   3. Notify user about Input Monitoring if neither of the above is granted
   *
   * Returns a human-readable summary of any missing permissions so callers
   * can surface it in the UI (e.g. agent window or tray notification).
   */
  async runStartupCheck(): Promise<string[]> {
    if (process.platform !== 'darwin') return [];

    const missing: string[] = [];

    // 1. Microphone — request eagerly so the system dialog appears early
    const micGranted = await this.requestMicrophonePermission();
    if (!micGranted) {
      missing.push('麦克风');
      logger.warn('Microphone permission not granted');
    } else {
      logger.info('Microphone permission OK');
    }

    // 2. Accessibility — prompt; this opens System Settings if not already trusted
    const a11yGranted = this.getAccessibilityStatus(true);
    if (!a11yGranted) {
      missing.push('辅助功能');
      logger.warn('Accessibility permission not granted — opening System Settings');
      // Prompt already opened System Settings via promptIfNeeded=true above.
    } else {
      logger.info('Accessibility permission OK');
    }

    // 3. Input Monitoring — no API to check. Always remind because without it
    // the keyboard hook can initialize successfully but receive zero events.
    missing.push('输入监控');
    logger.warn('Reminding user to grant Input Monitoring in System Settings');

    // 4. Screen Recording — required by `screencapture` (Command mode context capture).
    // Read-only check; no programmatic prompt is available.
    const screenStatus = this.getScreenRecordingStatus();
    if (screenStatus !== 'granted') {
      missing.push('屏幕录制');
      logger.warn('Screen Recording permission not granted — Command-mode screenshot will be skipped', { status: screenStatus });
    } else {
      logger.info('Screen Recording permission OK');
    }

    return missing;
  }

  /**
   * Show a system notification listing missing permissions with a
   * one-click button to open Input Monitoring settings (the one
   * that cannot be prompted programmatically).
   */
  showPermissionNotification(missing: string[]): void {
    if (!Notification.isSupported() || missing.length === 0) return;

    const n = new Notification({
      title: 'Sarah 需要系统权限',
      body: `语音功能需要：${missing.join('、')}。\n点击打开「输入监控」设置，其他项目系统已自动提示。`,
      silent: false,
    });

    n.on('click', () => {
      this.openSettings('inputMonitoring');
    });

    n.show();
    logger.info('Permission notification shown', { missing });
  }

  logPermissionStatus(): void {
    const status = this.checkPermissions();
    logger.info('Current permission status', status);

    if (!status.allGranted) {
      logger.warn('Missing permissions detected');
      if (status.microphone !== 'granted') {
        logger.warn('- Microphone: Not granted. Enable in System Settings > Privacy & Security > Microphone');
      }
      if (!status.accessibility) {
        logger.warn('- Accessibility: Not granted. Enable in System Settings > Privacy & Security > Accessibility');
      }
      if (status.screenRecording !== 'granted') {
        logger.warn('- Screen Recording: Not granted. Required for Command-mode screenshot. Enable in System Settings > Privacy & Security > Screen Recording');
      }
      logger.warn('- Input Monitoring: Cannot check programmatically. It is required for global hotkeys. Enable in System Settings > Privacy & Security > Input Monitoring, then restart the app');
    }
  }
}

export const permissionsService = new PermissionsService();
