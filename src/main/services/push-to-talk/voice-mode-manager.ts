/**
 * VoiceModeManager — unified state machine for all three voice modes.
 *
 * States
 *   idle                → no recording active
 *   dictation_recording → Right Ctrl pressed; will STT → polish → insert
 *   command_recording   → Right Ctrl + Shift; will STT → agentService.execute with page context
 *   quickask_recording  → Right Ctrl + Space; will STT → agentService.execute (minimal context)
 *
 * Hotkey rules
 *   idle + Right Ctrl           → dictation_recording
 *   idle + Right Ctrl + Shift   → command_recording
 *   idle + Right Ctrl + Space   → quickask_recording
 *   *_recording + Right Ctrl    → stop current mode (unified stop)
 *
 * Chord detection for "RCtrl pressed before Shift":
 *   KeyboardService.interceptChordOnNewModifier handles the swap automatically.
 *
 * The per-mode services (push-to-talk, voice-command, mode-c) no longer register
 * their own keyboard hooks — this class owns all three keyboard bindings.
 */

import log from 'electron-log';
import { globalShortcut } from 'electron';
import { UiohookKey } from 'uiohook-napi';
import { keyboardService } from '../keyboard';
import { asrService } from '../asr';
import { floatingWindow } from '../../windows';
import { agentWindow } from '../../windows/agent';
import { textInputService } from '../text-input';
import { dictationRefinementService } from '../agent';
import { contextCaptureService } from '../agent/context-capture.service';
import type { AgentContext } from '../../../shared/types/agent';
import type { VoiceOverlayMode, VoiceOverlayPhase } from '../../../shared/types/push-to-talk';

const logger = log.scope('voice-mode-manager');

export type VoiceState =
  | 'idle'
  | 'dictation_recording'
  | 'command_recording'
  | 'quickask_recording';

export class VoiceModeManager {
  private state: VoiceState = 'idle';
  private isInitialized = false;
  private readonly stopKeys = new Set<number>([
    UiohookKey.CtrlRight,
    UiohookKey.AltRight,
  ]);

  /**
   * True when the Right Ctrl keydown was consumed to stop a recording.
   * Prevents the subsequent onShortPress from re-starting dictation.
   */
  private ctrlUsedForStop = false;
  private lastStartTime = 0;

  private async toggleQuickAskFromShortcut(source: 'uiohook' | 'globalShortcut'): Promise<void> {
    logger.info('VoiceModeManager: quickask shortcut', { source, state: this.state });
    if (this.state === 'idle') {
      await this.startQuickAsk();
      return;
    }
    await this.stopCurrentMode();
  }

  initialize(): void {
    if (this.isInitialized) {
      logger.info('VoiceModeManager already initialized, skipping');
      return;
    }

    this.registerDictationToggle(UiohookKey.CtrlRight);
    // Fallback for keyboards / IME setups where Right Ctrl is hard to capture.
    this.registerDictationToggle(UiohookKey.AltRight);

    // ── Right Ctrl + Shift → command mode ───────────────────────────────────
    // interceptChordOnNewModifier in KeyboardService handles the case where
    // Right Ctrl was pressed slightly before Shift.
    // Re-pressing the chord while a recording is in progress acts as a unified
    // stop — covers the case where the user keeps Shift held when stopping.
    keyboardService.register({
      key: UiohookKey.CtrlRight,
      modifier: 'shift',
      onKeyDown: () => {
        if (this.state === 'idle') {
          void this.startCommandMode();
        } else {
          void this.stopCurrentMode();
        }
      },
    });
    keyboardService.register({
      key: UiohookKey.AltRight,
      modifier: 'shift',
      onKeyDown: () => {
        if (this.state === 'idle') {
          void this.startCommandMode();
        } else {
          void this.stopCurrentMode();
        }
      },
    });

    // ── Right Ctrl + Space → quick ask ──────────────────────────────────────
    // Space onKeyDown cancels the pending bare Right Ctrl handler so it cannot
    // fire dictation when Right Ctrl is eventually released.
    // Re-pressing the chord while recording acts as a unified stop.
    keyboardService.register({
      key: UiohookKey.Space,
      modifier: 'rctrl',
      onKeyDown: () => {
        keyboardService.cancelActiveHandler(UiohookKey.CtrlRight);
        void this.toggleQuickAskFromShortcut('uiohook');
      },
    });
    keyboardService.register({
      key: UiohookKey.Space,
      modifier: 'alt',
      onKeyDown: () => {
        keyboardService.cancelActiveHandler(UiohookKey.AltRight);
        void this.toggleQuickAskFromShortcut('uiohook');
      },
    });

    const quickAskRegistered = globalShortcut.register('Control+Space', () => {
      keyboardService.cancelActiveHandler(UiohookKey.CtrlRight);
      void this.toggleQuickAskFromShortcut('globalShortcut');
    });
    if (!quickAskRegistered) {
      logger.warn('Failed to register Control+Space global shortcut for Quick Ask');
    }

    this.isInitialized = true;
    logger.info('VoiceModeManager initialized');
  }

  dispose(): void {
    if (!this.isInitialized) {
      logger.info('VoiceModeManager not initialized, skipping dispose');
      return;
    }
    keyboardService.unregister(UiohookKey.CtrlRight);
    keyboardService.unregister(UiohookKey.AltRight);
    keyboardService.unregister(UiohookKey.CtrlRight, 'shift');
    keyboardService.unregister(UiohookKey.AltRight, 'shift');
    keyboardService.unregister(UiohookKey.Space, 'rctrl');
    keyboardService.unregister(UiohookKey.Space, 'alt');
    globalShortcut.unregister('Control+Space');
    this.isInitialized = false;
    logger.info('VoiceModeManager disposed');
  }

  get currentState(): VoiceState { return this.state; }
  get isRecording(): boolean { return this.state !== 'idle'; }
  get isReady(): boolean { return this.isInitialized; }

  async testDictationToggle(): Promise<void> {
    if (this.state === 'idle') {
      await this.startDictation();
      return;
    }
    await this.stopCurrentMode();
  }

  async testCommandModeToggle(): Promise<void> {
    if (this.state === 'idle') {
      await this.startCommandMode();
      return;
    }
    await this.stopCurrentMode();
  }

  /** Cancel recording without executing (floating window ✕ button). */
  async cancel(): Promise<void> {
    if (this.state === 'idle') return;
    const prev = this.state;
    this.state = 'idle';
    logger.info('VoiceModeManager: CANCEL', { prev });
    await asrService.stop();
    this.publishOverlayState('idle', 'idle');
    floatingWindow.hide();
  }

  /** Stop and execute (floating window ✓ button). */
  async confirm(): Promise<void> {
    await this.stopCurrentMode();
  }

  private publishOverlayState(mode: VoiceOverlayMode, phase: VoiceOverlayPhase): void {
    floatingWindow.sendVoiceState({ mode, phase });
  }

  private resetOverlayAndHide(): void {
    this.publishOverlayState('idle', 'idle');
    floatingWindow.forceHide();
  }

  private async cleanTranscript(raw: string, mode: VoiceOverlayMode): Promise<string> {
    if (!raw) return raw;
    try {
      const cleaned = await dictationRefinementService.refine(raw);
      return cleaned.trim() || raw;
    } catch (err) {
      logger.warn('cleanTranscript fallback to raw', {
        mode,
        message: err instanceof Error ? err.message : String(err),
      });
      return raw;
    }
  }

  private registerDictationToggle(key: number): void {
    keyboardService.register({
      key,
      onKeyDown: () => {
        if (this.state !== 'idle') {
          this.ctrlUsedForStop = this.stopKeys.has(key);
          void this.stopCurrentMode();
        } else {
          this.ctrlUsedForStop = false;
        }
      },
      onShortPress: () => {
        if (this.state === 'idle' && !this.ctrlUsedForStop) {
          void this.startDictation();
        }
        this.ctrlUsedForStop = false;
      },
    });
  }

  // ── Private start / stop helpers ──────────────────────────────────────────

  private async startDictation(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStartTime < 500) {
      logger.warn('VoiceModeManager: debounce dictation start');
      return;
    }
    this.lastStartTime = now;
    logger.info('VoiceModeManager: START dictation');
    this.state = 'dictation_recording';
    this.publishOverlayState('dictation', 'recording');
    try {
      await asrService.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'idle';
      this.publishOverlayState('dictation', 'error');
      floatingWindow.sendError(`语音启动失败: ${msg}`);
    }
  }

  private async startCommandMode(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStartTime < 500) {
      logger.warn('VoiceModeManager: debounce command start');
      return;
    }
    this.lastStartTime = now;
    logger.info('VoiceModeManager: START command');
    this.state = 'command_recording';
    this.publishOverlayState('command', 'recording');
    try {
      await asrService.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'idle';
      this.publishOverlayState('command', 'error');
      floatingWindow.sendError(`语音启动失败: ${msg}`);
    }
  }

  private async startQuickAsk(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStartTime < 500) {
      logger.warn('VoiceModeManager: debounce quickask start');
      return;
    }
    this.lastStartTime = now;
    logger.info('VoiceModeManager: START quickask');
    this.state = 'quickask_recording';
    this.publishOverlayState('quickask', 'recording');
    try {
      await asrService.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'idle';
      this.publishOverlayState('quickask', 'error');
      floatingWindow.sendError(`语音启动失败: ${msg}`);
    }
  }

  private async stopCurrentMode(): Promise<void> {
    switch (this.state) {
      case 'dictation_recording': await this.stopDictation(); break;
      case 'command_recording':   await this.stopCommand(); break;
      case 'quickask_recording':  await this.stopQuickAsk(); break;
      default: break;
    }
  }

  private async stopDictation(): Promise<void> {
    if (this.state !== 'dictation_recording') return;
    this.state = 'idle';
    logger.info('VoiceModeManager: STOP dictation');

    try {
      this.publishOverlayState('dictation', 'processing');
      floatingWindow.sendStatus('processing');
      const result = await asrService.stop();

      if (!result?.text?.trim()) {
        this.resetOverlayAndHide();
        return;
      }

      this.publishOverlayState('dictation', 'routing');
      floatingWindow.sendStatus('routing');
      const refined = await dictationRefinementService.refine(result.text);

      this.publishOverlayState('dictation', 'executing');
      floatingWindow.sendStatus('executing');
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      const insertResult = textInputService.insert(refined);
      if (!insertResult.success) {
        floatingWindow.sendError(`Insert failed: ${insertResult.error}`);
      } else {
        this.publishOverlayState('dictation', 'done');
        this.resetOverlayAndHide();
      }
    } catch (err) {
      this.publishOverlayState('dictation', 'error');
      const msg = err instanceof Error ? err.message : String(err);
      floatingWindow.sendError(`错误: ${msg}`);
    }
  }

  private async stopCommand(): Promise<void> {
    if (this.state !== 'command_recording') return;
    this.state = 'idle';
    logger.info('VoiceModeManager: STOP command');

    try {
      this.publishOverlayState('command', 'processing');
      floatingWindow.sendStatus('processing');
      const result = await asrService.stop();

      if (!result?.text?.trim()) {
        this.resetOverlayAndHide();
        return;
      }

      const rawTranscript = result.text.trim();
      this.publishOverlayState('command', 'routing');
      floatingWindow.sendStatus('routing');
      const transcript = await this.cleanTranscript(rawTranscript, 'command');

      let context: AgentContext = { appName: 'Unknown', windowTitle: '' };
      try { context = await contextCaptureService.capture(); } catch { /* ignore */ }
      this.publishOverlayState('command', 'executing');
      floatingWindow.sendStatus('executing');
      agentWindow.showWithContext(context);
      this.resetOverlayAndHide();
      agentWindow.sendExternalSubmit(transcript, context);

    } catch (err) {
      floatingWindow.allowHide();
      this.publishOverlayState('command', 'error');
      const msg = err instanceof Error ? err.message : String(err);
      floatingWindow.sendError(`错误: ${msg}`);
    }
  }

  private async stopQuickAsk(): Promise<void> {
    if (this.state !== 'quickask_recording') return;
    this.state = 'idle';
    logger.info('VoiceModeManager: STOP quickask');

    try {
      this.publishOverlayState('quickask', 'processing');
      floatingWindow.sendStatus('processing');
      const result = await asrService.stop();

      if (!result?.text?.trim()) {
        this.resetOverlayAndHide();
        return;
      }

      const rawTranscript = result.text.trim();
      this.publishOverlayState('quickask', 'routing');
      floatingWindow.sendStatus('routing');
      const transcript = await this.cleanTranscript(rawTranscript, 'quickask');

      const context: AgentContext = {
        appName: 'Voice Query',
        windowTitle: transcript.slice(0, 60),
      };

      this.publishOverlayState('quickask', 'executing');
      floatingWindow.sendStatus('executing');
      agentWindow.showWithContext(context);
      this.resetOverlayAndHide();
      agentWindow.sendExternalSubmit(transcript, context);

    } catch (err) {
      floatingWindow.allowHide();
      this.publishOverlayState('quickask', 'error');
      const msg = err instanceof Error ? err.message : String(err);
      floatingWindow.sendError(`错误: ${msg}`);
    }
  }
}

export const voiceModeManager = new VoiceModeManager();
