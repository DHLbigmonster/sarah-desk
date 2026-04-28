/**
 * Keyboard Service.
 * Provides global keyboard monitoring using uiohook-napi.
 *
 * Supports modifier-qualified triggers so multiple callers can bind to
 * the same key with different modifiers (e.g. RightCtrl alone → Dictation,
 * RightCtrl + Shift → Command, RightCtrl + Space → Quick Ask).
 * The underlying uiohook is started once and shared.
 */

import { uIOhook, UiohookKey } from 'uiohook-napi';
import log from 'electron-log';

const logger = log.scope('keyboard-service');

export type TriggerModifier = 'shift' | 'ctrl' | 'alt' | 'rctrl';

export interface TriggerConfig {
  /** uiohook-napi key code */
  key: number;
  /** Optional modifier that must be held together with `key` */
  modifier?: TriggerModifier;
  /** Called immediately on keydown (before any press-type classification) */
  onKeyDown?: () => void;
  /** Called when the key is released before the long-press threshold */
  onShortPress?: () => void;
  /** Called once when the key has been held past the long-press threshold */
  onLongPressStart?: () => void;
  /** Called when the key is released after a long press has started */
  onLongPressEnd?: () => void;
  /** Long-press threshold in ms (default 200) */
  longPressMs?: number;
}

interface TriggerState {
  isHeld: boolean;
  downAt: number;
  lastDownAt: number;
  lastUpAt: number;
  longPressTriggered: boolean;
  longPressTimer: NodeJS.Timeout | null;
}

interface KeyboardEvent {
  keycode: number;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

const DEBOUNCE_MS = 50;

// uiohook key codes for left+right Shift — tracked as modifier state
const SHIFT_KEYCODES = new Set([42, 54]); // UiohookKey.Shift, UiohookKey.ShiftRight

// uiohook key codes for LEFT Ctrl only — tracked as 'ctrl' modifier
const LEFT_CTRL_KEYCODES = new Set([29]); // UiohookKey.Ctrl (left only)

// Right Ctrl keycode — tracked as 'rctrl' modifier AND processed as a trigger
// This allows Right Ctrl + Space (Quick Ask) while Right Ctrl alone fires Dictation
const RIGHT_CTRL_KEYCODE = 3613; // UiohookKey.CtrlRight
const RIGHT_ALT_KEYCODE = UiohookKey.AltRight;
const STUCK_KEY_RESET_MS = 3000;

function compoundKey(keycode: number, modifier?: string): string {
  return `${keycode}:${modifier ?? ''}`;
}

export class KeyboardService {
  private triggers = new Map<string, { cfg: TriggerConfig; state: TriggerState }>();
  private isStarted = false;

  // Track modifier keys independently — don't rely on per-event flags
  private heldModifiers: Set<TriggerModifier> = new Set();
  // Remember which handler got the keyDown so keyUp always matches it
  private activeHandlers = new Map<number, { cfg: TriggerConfig; state: TriggerState }>();

  private boundKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
  private boundKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);

  private resetEntryState(
    keycode: number,
    entry: { cfg: TriggerConfig; state: TriggerState },
    reason: string,
  ): void {
    const { state } = entry;
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
    state.isHeld = false;
    state.longPressTriggered = false;
    this.activeHandlers.delete(keycode);
    logger.warn('Recovered stuck key state', { keycode, reason });
  }

  /**
   * Register a trigger key with its callbacks.
   * Can be called multiple times with different keys.
   * Starts the uiohook on the first registration.
   */
  register(cfg: TriggerConfig): void {
    this.triggers.set(compoundKey(cfg.key, cfg.modifier), {
      cfg,
      state: {
        isHeld: false,
        downAt: 0,
        lastDownAt: 0,
        lastUpAt: 0,
        longPressTriggered: false,
        longPressTimer: null,
      },
    });

    if (!this.isStarted) {
      uIOhook.on('keydown', this.boundKeyDown);
      uIOhook.on('keyup', this.boundKeyUp);
      uIOhook.start();
      this.isStarted = true;
      logger.info('Keyboard hook started');
    }

    logger.info('Trigger registered', { key: cfg.key, modifier: cfg.modifier });
  }

  /**
   * Unregister a specific trigger key (optionally with modifier).
   * Stops uiohook only when ALL triggers have been removed.
   */
  unregister(key: number, modifier?: TriggerModifier): void {
    const compKey = compoundKey(key, modifier);
    this.triggers.delete(compKey);

    if (this.triggers.size === 0 && this.isStarted) {
      uIOhook.off('keydown', this.boundKeyDown);
      uIOhook.off('keyup', this.boundKeyUp);
      uIOhook.stop();
      this.isStarted = false;
      logger.info('Keyboard hook stopped (no more triggers)');
    } else {
      logger.info('Trigger unregistered', { key, modifier, remaining: this.triggers.size });
    }
  }

  /** Unregister all triggers and stop the hook. */
  unregisterAll(): void {
    this.triggers.clear();
    if (this.isStarted) {
      uIOhook.off('keydown', this.boundKeyDown);
      uIOhook.off('keyup', this.boundKeyUp);
      uIOhook.stop();
      this.isStarted = false;
    }
  }

  get isActive(): boolean {
    return this.isStarted;
  }

  private resolveEntryAtKeyDown(keycode: number): { cfg: TriggerConfig; state: TriggerState } | undefined {
    // Prefer modifier-qualified trigger if a matching modifier is held
    for (const mod of this.heldModifiers) {
      const entry = this.triggers.get(compoundKey(keycode, mod));
      if (entry) return entry;
    }
    // Fall back to bare-key trigger
    return this.triggers.get(compoundKey(keycode, undefined));
  }

  /**
   * Cancel an active trigger (clear its timer, reset state, remove from activeHandlers).
   * Used by chord triggers (e.g. RightCtrl+Space) to prevent the primary key from
   * also firing its own onShortPress when released.
   */
  cancelActiveHandler(keycode: number): void {
    const entry = this.activeHandlers.get(keycode);
    if (!entry) return;
    const { state } = entry;
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
    state.isHeld = false;
    state.longPressTriggered = false;
    this.activeHandlers.delete(keycode);
  }

  /**
   * When a modifier key goes down, check if any currently-active bare handler
   * has a chord counterpart for that modifier. If so, swap the bare handler out
   * for the chord handler — this handles the case where the trigger key was
   * pressed slightly before the modifier (e.g. RCtrl then Shift).
   */
  private interceptChordOnNewModifier(newModifier: TriggerModifier): void {
    for (const [keycode, currentEntry] of this.activeHandlers) {
      if (currentEntry.cfg.modifier !== undefined) continue; // already a chord handler
      const chordEntry = this.triggers.get(compoundKey(keycode, newModifier));
      if (!chordEntry) continue;

      // Cancel the bare handler's timer and reset its state
      const { state: bareState } = currentEntry;
      if (bareState.longPressTimer) {
        clearTimeout(bareState.longPressTimer);
        bareState.longPressTimer = null;
      }
      bareState.isHeld = false;
      bareState.longPressTriggered = false;
      this.activeHandlers.delete(keycode);

      // Activate the chord handler
      const { cfg, state } = chordEntry;
      const now = Date.now();
      state.isHeld = true;
      state.downAt = now;
      state.lastDownAt = now;
      state.longPressTriggered = false;
      state.longPressTimer = setTimeout(() => {
        if (!state.isHeld || state.longPressTriggered) return;
        state.longPressTriggered = true;
        cfg.onLongPressStart?.();
      }, cfg.longPressMs ?? 200);
      this.activeHandlers.set(keycode, chordEntry);
      cfg.onKeyDown?.();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Log Right Ctrl events explicitly to confirm uiohook is receiving events
    if (e.keycode === RIGHT_CTRL_KEYCODE) {
      logger.info('Right Ctrl keydown received', { keycode: e.keycode });
    }
    // Track Shift modifier state independently
    if (SHIFT_KEYCODES.has(e.keycode)) {
      this.heldModifiers.add('shift');
      this.interceptChordOnNewModifier('shift');
      return;
    }

    if (LEFT_CTRL_KEYCODES.has(e.keycode)) {
      this.heldModifiers.add('ctrl');
      return;
    }

    if (e.keycode === RIGHT_ALT_KEYCODE) {
      this.heldModifiers.add('alt');
      // no return — Right Alt can also act as a trigger key
    }

    // Right Ctrl: track as 'rctrl' modifier AND fall through to trigger processing
    if (e.keycode === RIGHT_CTRL_KEYCODE) {
      this.heldModifiers.add('rctrl');
      // no return — continues to be processed as a trigger key
    }

    const entry = this.resolveEntryAtKeyDown(e.keycode);
    if (!entry) return;
    const { cfg, state } = entry;
    const now = Date.now();

    if (now - state.lastDownAt < DEBOUNCE_MS) return;
    if (state.isHeld) {
      const stuckFor = now - state.downAt;
      if (stuckFor < STUCK_KEY_RESET_MS) {
        return;
      }
      this.resetEntryState(e.keycode, entry, `missing keyup (${stuckFor}ms)`);
    }

    // Remember which handler owns this keycode until keyUp
    this.activeHandlers.set(e.keycode, entry);

    state.isHeld = true;
    state.downAt = now;
    state.lastDownAt = now;
    state.longPressTriggered = false;

    const threshold = cfg.longPressMs ?? 200;
    state.longPressTimer = setTimeout(() => {
      if (!state.isHeld || state.longPressTriggered) return;
      state.longPressTriggered = true;
      cfg.onLongPressStart?.();
    }, threshold);

    // Fire onKeyDown after state and timer are set — allows chord handlers to
    // immediately cancel sibling triggers (e.g. RightCtrl+Space cancels RightCtrl).
    cfg.onKeyDown?.();
  }

  private onKeyUp(e: KeyboardEvent): void {
    // Track Shift modifier state independently
    if (SHIFT_KEYCODES.has(e.keycode)) {
      this.heldModifiers.delete('shift');
      return;
    }

    if (LEFT_CTRL_KEYCODES.has(e.keycode)) {
      this.heldModifiers.delete('ctrl');
      return;
    }

    if (e.keycode === RIGHT_ALT_KEYCODE) {
      this.heldModifiers.delete('alt');
      // no return — continue keyUp processing for trigger handlers
    }

    // Right Ctrl: remove 'rctrl' modifier AND fall through to trigger processing
    if (e.keycode === RIGHT_CTRL_KEYCODE) {
      this.heldModifiers.delete('rctrl');
      // no return — continues to process keyUp for AgentVoice trigger
    }

    // Use the handler that got the keyDown — don't re-resolve (modifier may have changed)
    const entry = this.activeHandlers.get(e.keycode);
    if (!entry) return;
    this.activeHandlers.delete(e.keycode);

    const { cfg, state } = entry;
    const now = Date.now();

    if (!state.isHeld) return;
    if (now - state.lastUpAt < DEBOUNCE_MS) return;

    const held = now - state.downAt;
    state.isHeld = false;
    state.lastUpAt = now;
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }

    if (state.longPressTriggered) {
      cfg.onLongPressEnd?.();
      state.longPressTriggered = false;
      return;
    }

    logger.debug('Short press detected', { keycode: e.keycode, held });
    cfg.onShortPress?.();
  }
}

export const keyboardService = new KeyboardService();

// Re-export UiohookKey for convenience
export { UiohookKey };
