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
import type { HotkeyConfig } from '../../../shared/types/clawdesk-settings';
import { resolveTriggerKeycode } from '../../../shared/types/clawdesk-settings';

const logger = log.scope('voice-mode-manager');

export type VoiceState =
  | 'idle'
  | 'dictation_recording'
  | 'command_recording'
  | 'quickask_recording';

export class VoiceModeManager {
  private state: VoiceState = 'idle';
  private isInitialized = false;
  private isQuickAskShortcutInitialized = false;
  /** Context captured at command mode start (before agent window appears). */
  private pendingContext: AgentContext | null = null;
  /** The uiohook keycode of the currently registered trigger key. */
  private activeTriggerKeycode: number = UiohookKey.CtrlRight;
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

  initializeQuickAskShortcut(): void {
    if (this.isQuickAskShortcutInitialized) {
      logger.info('VoiceModeManager quick ask shortcut already initialized, skipping');
      return;
    }

    const quickAskRegistered = globalShortcut.register('Control+Space', () => {
      keyboardService.cancelActiveHandler(this.activeTriggerKeycode);
      void this.toggleQuickAskFromShortcut('globalShortcut');
    });
    this.isQuickAskShortcutInitialized = true;

    if (quickAskRegistered) {
      logger.info('Registered Control+Space global shortcut for Quick Ask');
      return;
    }

    logger.warn('Failed to register Control+Space global shortcut for Quick Ask');
  }

  initialize(config?: HotkeyConfig): void {
    if (this.isInitialized) {
      logger.info('VoiceModeManager already initialized, skipping');
      return;
    }

    const keycode = config ? resolveTriggerKeycode(config) : UiohookKey.CtrlRight;
    this.activeTriggerKeycode = keycode;
    this.stopKeys.clear();
    this.stopKeys.add(keycode);

    // For non-modifier trigger keys (CapsLock, F-keys, MetaRight), register
    // them as pseudo-modifiers so Space chords can be detected.
    const isStandardModifier = ([
      UiohookKey.CtrlRight, UiohookKey.AltRight, UiohookKey.Ctrl,
      UiohookKey.Shift, UiohookKey.ShiftRight,
    ] as readonly number[]).includes(keycode);
    if (!isStandardModifier) {
      keyboardService.setTriggerKeycode(keycode);
    }

    // Determine the modifier string for Space+trigger chords.
    const triggerModifier = this.resolveTriggerModifier(keycode);

    this.registerDictationToggle(keycode);

    // ── trigger + Shift → command mode ──────────────────────────────────────
    keyboardService.register({
      key: keycode,
      modifier: 'shift',
      onKeyDown: () => {
        if (this.state === 'idle') {
          void this.startCommandMode();
        } else {
          void this.stopCurrentMode();
        }
      },
    });

    // ── trigger + Space → quick ask ─────────────────────────────────────────
    keyboardService.register({
      key: UiohookKey.Space,
      modifier: triggerModifier,
      onKeyDown: () => {
        keyboardService.cancelActiveHandler(keycode);
        void this.toggleQuickAskFromShortcut('uiohook');
      },
    });

    this.initializeQuickAskShortcut();

    this.isInitialized = true;
    logger.info('VoiceModeManager initialized', {
      triggerKeycode: keycode,
      voiceTriggerKey: config?.voiceTriggerKey ?? 'CtrlRight',
    });
  }

  dispose(): void {
    if (!this.isInitialized) {
      if (this.isQuickAskShortcutInitialized) {
        globalShortcut.unregister('Control+Space');
        this.isQuickAskShortcutInitialized = false;
      }
      logger.info('VoiceModeManager not initialized, skipping dispose');
      return;
    }
    const keycode = this.activeTriggerKeycode;
    const modifier = this.resolveTriggerModifier(keycode);
    keyboardService.unregister(keycode);
    keyboardService.unregister(keycode, 'shift');
    keyboardService.unregister(UiohookKey.Space, modifier);
    if (this.isQuickAskShortcutInitialized) {
      globalShortcut.unregister('Control+Space');
      this.isQuickAskShortcutInitialized = false;
    }
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

  /**
   * Map a trigger keycode to the uiohook modifier string used for Space+trigger
   * chords (Quick Ask). The KeyboardService expects 'rctrl' for CtrlRight,
   * 'alt' for AltRight, etc.
   */
  private resolveTriggerModifier(keycode: number): 'rctrl' | 'alt' | 'ctrl' | 'shift' | 'trigger' {
    if (keycode === UiohookKey.CtrlRight) return 'rctrl';
    if (keycode === UiohookKey.AltRight) return 'alt';
    if (keycode === UiohookKey.Ctrl) return 'ctrl';
    if (keycode === UiohookKey.Shift || keycode === UiohookKey.ShiftRight) return 'shift';
    // For non-modifier keys (CapsLock, F-keys, Meta), use the 'trigger'
    // pseudo-modifier tracked by KeyboardService.setTriggerKeycode().
    return 'trigger';
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

    // Capture context BEFORE showing overlay, so we get the user's actual
    // frontmost app (not our own CodePilot window that appears on overlay).
    try { this.pendingContext = await contextCaptureService.capture(); } catch { this.pendingContext = null; }

    this.state = 'command_recording';
    this.publishOverlayState('command', 'recording');

    try {
      await asrService.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'idle';
      this.pendingContext = null;
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

    const t0 = Date.now();
    try {
      this.publishOverlayState('command', 'processing');
      floatingWindow.sendStatus('processing');
      const result = await asrService.stop();
      const tAsr = Date.now();

      if (!result?.text?.trim()) {
        logger.info('voice-timing command empty', { asr_stop_ms: tAsr - t0 });
        this.resetOverlayAndHide();
        return;
      }

      const rawTranscript = result.text.trim();
      this.publishOverlayState('command', 'routing');
      floatingWindow.sendStatus('routing');
      const transcript = await this.cleanTranscript(rawTranscript, 'command');
      const tClean = Date.now();

      const context = this.pendingContext ?? { appName: 'Unknown', windowTitle: '' };
      this.pendingContext = null;
      const tCtx = Date.now();
      this.publishOverlayState('command', 'executing');
      floatingWindow.sendStatus('executing');
      agentWindow.showWithContext(context);
      this.resetOverlayAndHide();
      agentWindow.sendExternalSubmit(transcript, context);
      const tHandoff = Date.now();
      logger.info('voice-timing command', {
        asr_stop_ms: tAsr - t0,
        transcript_clean_ms: tClean - tAsr,
        context_capture_ms: tCtx - tClean,
        handoff_ms: tHandoff - tCtx,
        total_ms: tHandoff - t0,
        transcript_chars: transcript.length,
      });

    } catch (err) {
      this.pendingContext = null;
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

    const t0 = Date.now();
    try {
      this.publishOverlayState('quickask', 'processing');
      floatingWindow.sendStatus('processing');
      const result = await asrService.stop();
      const tAsr = Date.now();

      if (!result?.text?.trim()) {
        logger.info('voice-timing quickask empty', { asr_stop_ms: tAsr - t0 });
        this.resetOverlayAndHide();
        return;
      }

      const rawTranscript = result.text.trim();
      this.publishOverlayState('quickask', 'routing');
      floatingWindow.sendStatus('routing');
      const transcript = await this.cleanTranscript(rawTranscript, 'quickask');
      const tClean = Date.now();

      const context: AgentContext = {
        appName: 'Voice Query',
        windowTitle: transcript.slice(0, 60),
      };

      this.publishOverlayState('quickask', 'executing');
      floatingWindow.sendStatus('executing');
      agentWindow.showWithContext(context);
      this.resetOverlayAndHide();
      agentWindow.sendExternalSubmit(transcript, context);
      const tHandoff = Date.now();
      logger.info('voice-timing quickask', {
        asr_stop_ms: tAsr - t0,
        transcript_clean_ms: tClean - tAsr,
        handoff_ms: tHandoff - tClean,
        total_ms: tHandoff - t0,
        transcript_chars: transcript.length,
      });

    } catch (err) {
      floatingWindow.allowHide();
      this.publishOverlayState('quickask', 'error');
      const msg = err instanceof Error ? err.message : String(err);
      floatingWindow.sendError(`错误: ${msg}`);
    }
  }
}

export const voiceModeManager = new VoiceModeManager();
