import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all Electron / native deps ──────────────────────────────────────────
// vi.mock factories are hoisted, so mocks must be created with vi.hoisted().

const {
  mockKeyboardService,
  mockAsrService,
  mockFloatingWindow,
  mockAgentWindow,
  mockGlobalShortcut,
} = vi.hoisted(() => ({
  mockKeyboardService: {
    register: vi.fn(),
    unregister: vi.fn(),
    cancelActiveHandler: vi.fn(),
  },
  mockAsrService: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue({ text: 'hello world' }),
  },
  mockFloatingWindow: {
    sendVoiceState: vi.fn(),
    sendStatus: vi.fn(),
    sendError: vi.fn(),
    hide: vi.fn(),
    forceHide: vi.fn(),
    deferHide: vi.fn(),
    allowHide: vi.fn(),
  },
  mockAgentWindow: {
    showWithContext: vi.fn(),
    sendExternalSubmit: vi.fn(),
  },
  mockGlobalShortcut: {
    register: vi.fn().mockReturnValue(true),
    unregister: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  globalShortcut: mockGlobalShortcut,
}));

vi.mock('electron-log', () => ({
  default: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

vi.mock('uiohook-napi', () => ({
  UiohookKey: { CtrlRight: 0xa3, AltRight: 0xa5, Space: 0x20, Shift: 0x10 },
}));

vi.mock('../keyboard', () => ({ keyboardService: mockKeyboardService }));
vi.mock('../asr', () => ({ asrService: mockAsrService }));
vi.mock('../../windows', () => ({ floatingWindow: mockFloatingWindow }));
vi.mock('../../windows/agent', () => ({ agentWindow: mockAgentWindow }));

vi.mock('../text-input', () => ({
  textInputService: { insert: vi.fn().mockReturnValue({ success: true }) },
}));

vi.mock('../agent', () => ({
  dictationRefinementService: { refine: vi.fn().mockResolvedValue('refined text') },
}));

vi.mock('../agent/context-capture.service', () => ({
  contextCaptureService: {
    capture: vi.fn().mockResolvedValue({ appName: 'TestApp', windowTitle: 'Test' }),
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { VoiceModeManager } from './voice-mode-manager';

// Helper to call private methods
type VMM = { [key: string]: (...args: unknown[]) => Promise<void> | void };

describe('VoiceModeManager — state transitions', () => {
  let mgr: VoiceModeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new VoiceModeManager();
  });

  // ── Initial state ───────────────────────────────────────────────────────────

  it('starts in idle state', () => {
    expect(mgr.currentState).toBe('idle');
    expect(mgr.isRecording).toBe(false);
  });

  // ── Dictation ───────────────────────────────────────────────────────────────

  it('transitions idle → dictation_recording on startDictation', async () => {
    await (mgr as unknown as VMM).startDictation();
    expect(mgr.currentState).toBe('dictation_recording');
    expect(mgr.isRecording).toBe(true);
    expect(mockAsrService.start).toHaveBeenCalledOnce();
  });

  it('transitions dictation_recording → idle on stopDictation', async () => {
    await (mgr as unknown as VMM).startDictation();
    await (mgr as unknown as VMM).stopDictation();
    expect(mgr.currentState).toBe('idle');
    expect(mgr.isRecording).toBe(false);
    expect(mockAsrService.stop).toHaveBeenCalledOnce();
  });

  it('force-hides immediately after successful dictation insert', async () => {
    await (mgr as unknown as VMM).startDictation();
    await (mgr as unknown as VMM).stopDictation();
    expect(mockFloatingWindow.forceHide).toHaveBeenCalledOnce();
    expect(mockFloatingWindow.sendStatus).not.toHaveBeenCalledWith('done');
  });

  // ── Command ──────────────────────────────────────────────────────────────────

  it('transitions idle → command_recording on startCommandMode', async () => {
    await (mgr as unknown as VMM).startCommandMode();
    expect(mgr.currentState).toBe('command_recording');
    expect(mgr.isRecording).toBe(true);
  });

  it('transitions command_recording → idle on stopCommand', async () => {
    await (mgr as unknown as VMM).startCommandMode();
    await (mgr as unknown as VMM).stopCommand();
    expect(mgr.currentState).toBe('idle');
    expect(mockAgentWindow.showWithContext).toHaveBeenCalledOnce();
    expect(mockAgentWindow.sendExternalSubmit).toHaveBeenCalledOnce();
  });

  it('resets overlay state before hiding after command submit', async () => {
    await (mgr as unknown as VMM).startCommandMode();
    await (mgr as unknown as VMM).stopCommand();
    expect(mockFloatingWindow.sendVoiceState).toHaveBeenLastCalledWith({ mode: 'idle', phase: 'idle' });
    expect(mockFloatingWindow.forceHide).toHaveBeenCalledOnce();
  });

  // ── Quick Ask ────────────────────────────────────────────────────────────────

  it('transitions idle → quickask_recording on startQuickAsk', async () => {
    await (mgr as unknown as VMM).startQuickAsk();
    expect(mgr.currentState).toBe('quickask_recording');
    expect(mgr.isRecording).toBe(true);
  });

  it('transitions quickask_recording → idle on stopQuickAsk', async () => {
    await (mgr as unknown as VMM).startQuickAsk();
    await (mgr as unknown as VMM).stopQuickAsk();
    expect(mgr.currentState).toBe('idle');
    expect(mockAgentWindow.sendExternalSubmit).toHaveBeenCalledOnce();
  });

  it('resets overlay state before hiding after quick ask submit', async () => {
    await (mgr as unknown as VMM).startQuickAsk();
    await (mgr as unknown as VMM).stopQuickAsk();
    expect(mockFloatingWindow.sendVoiceState).toHaveBeenLastCalledWith({ mode: 'idle', phase: 'idle' });
    expect(mockFloatingWindow.forceHide).toHaveBeenCalledOnce();
  });

  // ── Debounce guard ───────────────────────────────────────────────────────────

  it('debounces rapid startDictation calls within 500 ms', async () => {
    await (mgr as unknown as VMM).startDictation();
    await (mgr as unknown as VMM).stopDictation();
    // second call within 500 ms should be ignored
    await (mgr as unknown as VMM).startDictation();
    expect(mockAsrService.start).toHaveBeenCalledOnce();
  });

  // ── Guard: stop only dispatches to current mode ───────────────────────────

  it('stopDictation is a no-op when in command_recording', async () => {
    await (mgr as unknown as VMM).startCommandMode();
    await (mgr as unknown as VMM).stopDictation();
    // state unchanged, still in command_recording
    expect(mgr.currentState).toBe('command_recording');
    expect(mockAsrService.stop).not.toHaveBeenCalled();
  });

  // ── Cancel ────────────────────────────────────────────────────────────────────

  it('cancel from dictation_recording returns to idle without executing', async () => {
    await (mgr as unknown as VMM).startDictation();
    await mgr.cancel();
    expect(mgr.currentState).toBe('idle');
    expect(mockFloatingWindow.hide).toHaveBeenCalledOnce();
  });

  it('cancel from idle is a no-op', async () => {
    await mgr.cancel();
    expect(mgr.currentState).toBe('idle');
    expect(mockAsrService.stop).not.toHaveBeenCalled();
  });

  // ── Error resilience ──────────────────────────────────────────────────────────

  it('returns to idle when ASR start throws', async () => {
    mockAsrService.start.mockRejectedValueOnce(new Error('mic denied'));
    await (mgr as unknown as VMM).startDictation();
    expect(mgr.currentState).toBe('idle');
    expect(mockFloatingWindow.sendError).toHaveBeenCalledOnce();
  });

  // ── Empty ASR result handling ─────────────────────────────────────────────────

  it('force-hides and stays idle when ASR returns empty text after dictation', async () => {
    mockAsrService.stop.mockResolvedValueOnce({ text: '' });
    await (mgr as unknown as VMM).startDictation();
    await (mgr as unknown as VMM).stopDictation();
    expect(mockFloatingWindow.forceHide).toHaveBeenCalledOnce();
    expect(mgr.currentState).toBe('idle');
  });

  it('force-hides when ASR returns null after command', async () => {
    mockAsrService.stop.mockResolvedValueOnce(null);
    await (mgr as unknown as VMM).startCommandMode();
    await (mgr as unknown as VMM).stopCommand();
    expect(mockFloatingWindow.forceHide).toHaveBeenCalledOnce();
    expect(mgr.currentState).toBe('idle');
  });

  // ── Initialize / dispose ──────────────────────────────────────────────────────

  it('registers hotkeys on initialize', () => {
    mgr.initialize();
    expect(mockKeyboardService.register).toHaveBeenCalled();
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith('Control+Space', expect.any(Function));
  });

  it('starts quick ask from Control+Space global shortcut fallback', async () => {
    mgr.initialize();
    const callback = mockGlobalShortcut.register.mock.calls.find(
      ([accelerator]) => accelerator === 'Control+Space',
    )?.[1] as (() => void) | undefined;
    expect(callback).toBeDefined();

    callback?.();
    await vi.waitFor(() => {
      expect(mgr.currentState).toBe('quickask_recording');
    });
    expect(mockKeyboardService.cancelActiveHandler).toHaveBeenCalledWith(0xa3);
    expect(mockAsrService.start).toHaveBeenCalledOnce();
  });

  it('initialize is idempotent', () => {
    mgr.initialize();
    const callCount = mockKeyboardService.register.mock.calls.length;
    mgr.initialize();
    expect(mockKeyboardService.register.mock.calls.length).toBe(callCount);
  });

  it('unregisters hotkeys on dispose', () => {
    mgr.initialize();
    mgr.dispose();
    expect(mockKeyboardService.unregister).toHaveBeenCalled();
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('Control+Space');
  });
});
