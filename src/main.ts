// Suppress EPIPE errors when stdout/stderr pipe closes (e.g. launched from a terminal that exits)
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, shell, Notification } from 'electron';
import path from 'node:path';
import dotenv from 'dotenv';
import log from 'electron-log';

// Load .env from correct path in packaged app
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../.env');
const result = dotenv.config({ path: envPath });
log.info('[ENV] Loading from:', envPath);
log.info('[ENV] Result:', result.error ? `ERROR: ${result.error}` : `OK, keys: ${Object.keys(result.parsed || {}).join(', ')}`);
log.info('[ENV] VOLCENGINE_APP_ID:', process.env.VOLCENGINE_APP_ID ? 'SET' : 'MISSING');
import started from 'electron-squirrel-startup';
import { setupAllIpcHandlers } from './main/ipc';
import { floatingWindow, agentWindow, clawDeskMainWindow, miniSettingsWindow, setQuitting } from './main/windows';
import { voiceModeManager } from './main/services/push-to-talk/voice-mode-manager';
import { permissionsService } from './main/services/permissions';
import { trayStateService } from './main/services/tray/tray-state.service';
import { commandResultStore } from './main/services/tray/command-result.store';
import { IPC_CHANNELS } from './shared/constants/channels';
import { asrService } from './main/services/asr/asr.service';
import { isASRConfigured } from './main/services/asr';
import { lightweightRefinementClient } from './main/services/agent/lightweight-refinement-client';
import { dictationRefinementService } from './main/services/agent';
import { textInputService } from './main/services/text-input';
import { getIsAppQuitting, markAppQuitting } from './main/app-lifecycle';
import type { MiniStatus } from './shared/types/mini';

const logger = log.scope('main');

if (started) {
  app.quit();
}

const smokeTestMode = process.env.SARAH_SMOKE_TEST === '1';

// IPC handlers must be registered before any window is created
setupAllIpcHandlers();
setupMiniIpcHandlers();

let tray: Tray | null = null;
/**
 * Hidden renderer that hosts the AudioRecorder (Web Audio API).
 * Main process cannot call getUserMedia directly, so we keep one
 * invisible BrowserWindow whose sole job is to capture microphone
 * audio when ASR status becomes "listening" and stream chunks back
 * via IPC. Without this window, push-to-talk and agent-voice would
 * never record any audio.
 */
let recorderWindow: BrowserWindow | null = null;
let recorderWindowReady = false;
let recorderRendererReady = false;
let recorderLastPongAt: number | null = null;

interface MiniTestResult {
  success: boolean;
  detail: string;
}

function syncRecorderWindowStatus(): void {
  if (!recorderWindow || recorderWindow.isDestroyed()) {
    return;
  }

  const status = asrService.currentStatus;
  if (status !== 'idle') {
    recorderWindow.webContents.send(IPC_CHANNELS.ASR.STATUS, status);
  }
}

function recreateRecorderWindow(reason: string): void {
  if (getIsAppQuitting()) {
    return;
  }

  logger.warn('Recreating recorder window', { reason, currentStatus: asrService.currentStatus });
  recorderWindowReady = false;
  recorderRendererReady = false;

  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.removeAllListeners();
    recorderWindow.webContents.removeAllListeners();
    recorderWindow.destroy();
  }
  recorderWindow = null;

  createRecorderWindow();
}

function createRecorderWindow(): void {
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    return;
  }

  recorderWindowReady = false;
  recorderRendererReady = false;
  recorderWindow = new BrowserWindow({
    width: 1,
    height: 1,
    x: -2000,
    y: -2000,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    recorderWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    recorderWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Auto-grant media permissions so getUserMedia resolves in the hidden window
  recorderWindow.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      callback(permission === 'media');
    },
  );
  recorderWindow.webContents.session.setPermissionCheckHandler(
    (_wc, permission) => {
      return permission === 'media';
    },
  );

  recorderWindow.webContents.on('console-message', (_e, level, message) => {
    const tag = ['verbose','info','warn','error'][level] ?? 'info';
    logger.info(`[recorder-renderer][${tag}] ${message}`);
  });

  recorderWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    recorderWindowReady = false;
    recorderRendererReady = false;
    logger.error('Recorder window failed to load', { code, desc });
    recreateRecorderWindow(`did-fail-load:${code}`);
  });

  recorderWindow.webContents.on('did-finish-load', () => {
    recorderWindowReady = true;
    logger.info('Recorder window ready');
    syncRecorderWindowStatus();
  });

  recorderWindow.webContents.on('render-process-gone', (_event, details) => {
    recorderWindowReady = false;
    recorderRendererReady = false;
    logger.error('Recorder renderer process gone', details);
    recreateRecorderWindow(`render-process-gone:${details.reason}`);
  });

  recorderWindow.on('closed', () => {
    recorderWindow = null;
    recorderWindowReady = false;
    recorderRendererReady = false;
  });

  logger.info('Recorder window created (hidden)');
}

async function getMiniStatus(): Promise<MiniStatus> {
  const gateway = await clawDeskMainWindow.getStatus();
  const gatewayUrl = `http://${gateway.endpoint}`;
  const micStatus = permissionsService.getMicrophoneStatus();
  const accessibilityGranted = permissionsService.getAccessibilityStatus();

  return {
    mode: 'mini',
    gateway: {
      url: gatewayUrl,
      state: gateway.state,
      detail: gateway.detail,
    },
    asrProvider: {
      name: 'Volcengine ASR',
      configured: isASRConfigured(),
      detail: micStatus === 'granted' ? 'Microphone granted' : `Microphone ${micStatus}`,
    },
    refinementProvider: {
      name: 'Dictation refinement',
      configured: lightweightRefinementClient.isConfigured(),
      detail: lightweightRefinementClient.isConfigured() ? 'Model configured' : 'Using local fallback',
    },
    hotkeys: {
      accessibilityGranted,
      keyboardHookActive: voiceModeManager.isReady,
      currentVoiceState: voiceModeManager.currentState,
    },
    recorder: {
      created: Boolean(recorderWindow && !recorderWindow.isDestroyed()),
      ready: recorderWindowReady && recorderRendererReady,
      asrStatus: asrService.currentStatus,
    },
  };
}

function notifyMiniTest(name: string, result: MiniTestResult): void {
  const status = result.success ? 'PASS' : 'FAIL';
  logger.info(`Mini debug test ${status}`, { name, detail: result.detail });
  if (!Notification.isSupported()) return;

  new Notification({
    title: `Sarah ${status}`,
    body: `${name}: ${result.detail}`,
    silent: true,
  }).show();
}

async function runMiniTest(name: string, task: () => Promise<MiniTestResult>): Promise<void> {
  try {
    notifyMiniTest(name, await task());
  } catch (error) {
    notifyMiniTest(name, {
      success: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function waitForRecorderRendererReady(timeoutMs = 3000): Promise<boolean> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = (): void => {
      if (recorderWindowReady && recorderRendererReady) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function testRecorderWindow(): Promise<MiniTestResult> {
  createRecorderWindow();
  const ready = await waitForRecorderRendererReady();
  return {
    success: ready,
    detail: ready
      ? 'recorderWindow loaded recorder html, preload, and renderer ready IPC'
      : `created=${Boolean(recorderWindow && !recorderWindow.isDestroyed())}, htmlLoaded=${recorderWindowReady}, rendererReady=${recorderRendererReady}`,
  };
}

async function testRecorderIpc(): Promise<MiniTestResult> {
  const recorderResult = await testRecorderWindow();
  if (!recorderResult.success || !recorderWindow || recorderWindow.isDestroyed()) {
    return recorderResult;
  }

  const targetRecorderWindow = recorderWindow;
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pongReceived = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      ipcMain.off(IPC_CHANNELS.MINI.RECORDER_PONG, handler);
      resolve(false);
    }, 1500);

    const handler = (_event: Electron.IpcMainEvent, responseNonce: string): void => {
      if (responseNonce !== nonce) return;
      clearTimeout(timeout);
      ipcMain.off(IPC_CHANNELS.MINI.RECORDER_PONG, handler);
      recorderLastPongAt = Date.now();
      resolve(true);
    };

    ipcMain.on(IPC_CHANNELS.MINI.RECORDER_PONG, handler);
    targetRecorderWindow.webContents.send(IPC_CHANNELS.MINI.RECORDER_PING, nonce);
  });

  return {
    success: pongReceived,
    detail: pongReceived
      ? `recorder ping/pong OK (${recorderLastPongAt ?? 0})`
      : 'recorder ping timed out before renderer pong',
  };
}

async function testAsrMock(): Promise<MiniTestResult> {
  const mockFinalText = 'Sarah test';
  const refined = await dictationRefinementService.refine(mockFinalText);
  const ok = refined.trim().length > 0;
  return {
    success: ok,
    detail: ok
      ? `mock ASR final text refined to: ${refined.slice(0, 80)}`
      : 'mock ASR final text produced empty refinement',
  };
}

async function testTextInsertMock(): Promise<MiniTestResult> {
  const result = textInputService.insert('Sarah test');
  return {
    success: result.success,
    detail: result.success ? 'inserted fixed text: Sarah test' : (result.error ?? 'insert failed'),
  };
}

function setupMiniIpcHandlers(): void {
  ipcMain.on(IPC_CHANNELS.MINI.RECORDER_READY, () => {
    recorderRendererReady = true;
    logger.info('Recorder renderer ready IPC received');
  });

  ipcMain.handle(IPC_CHANNELS.MINI.GET_STATUS, () => getMiniStatus());
  ipcMain.handle(IPC_CHANNELS.MINI.SHOW_LOGS, async () => {
    const logPath = app.getPath('logs');
    const error = await shell.openPath(logPath);
    return { success: error === '', error: error || undefined };
  });
  ipcMain.handle(IPC_CHANNELS.MINI.TEST_RECORDER_WINDOW, () => testRecorderWindow());
  ipcMain.handle(IPC_CHANNELS.MINI.TEST_IPC, () => testRecorderIpc());
  ipcMain.handle(IPC_CHANNELS.MINI.TEST_ASR_MOCK, () => testAsrMock());
  ipcMain.handle(IPC_CHANNELS.MINI.TEST_TEXT_INSERT_MOCK, () => testTextInsertMock());
}

async function runMiniSmokeTestAndQuit(): Promise<void> {
  const checks: Array<{ name: string; success: boolean; detail: string }> = [];

  checks.push({
    name: 'tray-created',
    success: Boolean(tray),
    detail: tray ? 'tray/menu bar exists' : 'tray/menu bar missing',
  });

  checks.push({
    name: 'legacy-debug-console-hidden',
    success: !clawDeskMainWindow.isVisible(),
    detail: clawDeskMainWindow.isVisible() ? 'Sarah Debug Console is visible' : 'Sarah Debug Console is hidden',
  });

  checks.push({ name: 'recorder-window', ...(await testRecorderWindow()) });
  checks.push({ name: 'recorder-ipc', ...(await testRecorderIpc()) });

  const failed = checks.filter((check) => !check.success);
  logger.info('Sarah smoke test results', { checks });
  console.log(`MINI_SMOKE_TEST_RESULTS ${JSON.stringify(checks)}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
  app.quit();
}

// ─── Tray icon ────────────────────────────────────────────────────────────────

function createMacTrayTemplateIcon(): Electron.NativeImage {
  // 22×22 RGBA PNG: 5-bar waveform, black pixels on transparent background.
  // createFromBuffer requires PNG/JPEG binary, not SVG text — using pre-built PNG.
  const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAKklEQVR42mNgGK7gPxSPQIPRDSLEH0YGk2oQ0RaNGjyEDR7NIKPF5lAGAJO4a5WaxT9LAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${PNG_BASE64}`);
  icon.setTemplateImage(true);
  return icon;
}

function createTray(): void {
  // Tray icon resolution:
  //   - dev:  assets/tray-icon.png at project root
  //   - prod: copied next to the packaged app via forge.config.ts
  //           (packagerConfig.extraResource places single files flat in
  //            Contents/Resources, so no "assets/" prefix in prod)
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(__dirname, '..', 'assets', 'tray-icon.png');

  // On macOS use a template icon so the menu bar can tint it correctly.
  // The bundled PNG is large/full-color and can render as a blank square.
  let icon: Electron.NativeImage;
  if (process.platform === 'darwin') {
    icon = createMacTrayTemplateIcon();
  } else {
    try {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } catch {
      icon = nativeImage.createEmpty();
    }
  }

  tray = new Tray(icon);
  tray.setToolTip('Sarah');
  trayStateService.attach(tray, icon);

  const rebuildMenu = (): void => {
    const micOk = permissionsService.getMicrophoneStatus() === 'granted';
    const a11yOk = permissionsService.getAccessibilityStatus();
    const baseOk = micOk && a11yOk;

    const menu = Menu.buildFromTemplate([
      {
        label: 'Sarah Settings',
        click: () => miniSettingsWindow.show(),
      },
      {
        label: 'Voice',
        submenu: [
          {
            label: voiceModeManager.currentState === 'dictation_recording'
              ? 'Stop Dictation'
              : 'Start Dictation',
            click: () => void voiceModeManager.testDictationToggle(),
          },
          {
            label: voiceModeManager.currentState === 'command_recording'
              ? 'Stop Command Mode'
              : 'Start Command Mode',
            click: () => void voiceModeManager.testCommandModeToggle(),
          },
        ],
      },
      {
        label: 'Diagnostics',
        submenu: [
          {
            label: 'Recorder Window',
            click: () => void runMiniTest('Recorder Window', testRecorderWindow),
          },
          {
            label: 'Recorder IPC',
            click: () => void runMiniTest('Recorder IPC', testRecorderIpc),
          },
          {
            label: 'ASR Mock',
            click: () => void runMiniTest('ASR Mock', testAsrMock),
          },
          {
            label: 'Text Insert (writes focused app)',
            click: () => void runMiniTest('Text Insert', testTextInsertMock),
          },
          { type: 'separator' },
          {
            label: 'Open Logs Folder',
            click: () => void shell.openPath(app.getPath('logs')),
          },
        ],
      },
      { type: 'separator' },
      {
        label: baseOk ? 'Check Input Monitoring…' : 'Fix Voice Permissions…',
        click: () => void openPermissions(),
        toolTip: baseOk
          ? '麦克风和辅助功能已授权；全局热键还依赖输入监控，授权后需重启应用'
          : '点击检查并授予缺少的权限',
      },
      { type: 'separator' },
      {
        label: 'Open Sarah Debug Console',
        click: () => clawDeskMainWindow.show(),
      },
      {
        label: 'Quit',
        accelerator: 'CommandOrControl+Q',
        click: () => app.quit(),
      },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuildMenu();

  // Left-click behavior depends on tray state:
  //   done-unread → show buffered Command result in agent window + reset to idle
  //   otherwise   → open tray context menu
  tray.on('click', () => {
    if (trayStateService.getState() === 'done-unread') {
      const record = commandResultStore.get();
      if (record) {
        agentWindow.showWithBufferedResult(
          record.transcript,
          record.context,
          record.result,
          record.isError,
        );
      }
      commandResultStore.clear();
      trayStateService.setState('idle');
      return;
    }
    tray?.popUpContextMenu();
  });

  const clawDeskWindow = clawDeskMainWindow.getWindow();
  if (clawDeskWindow) {
    clawDeskWindow.on('show', rebuildMenu);
    clawDeskWindow.on('hide', rebuildMenu);
  }
}

// ─── Permissions helper ───────────────────────────────────────────────────────

async function openPermissions(): Promise<void> {
  const micOk = permissionsService.getMicrophoneStatus() === 'granted';
  const a11yOk = permissionsService.getAccessibilityStatus();

  if (!micOk) {
    const granted = await permissionsService.requestMicrophonePermission();
    if (!granted) permissionsService.openSettings('microphone');
  }
  if (!a11yOk) {
    permissionsService.getAccessibilityStatus(true); // prompts system dialog
  }
  // Input Monitoring always open manually
  permissionsService.openSettings('inputMonitoring');
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', async () => {
  // Request microphone permission BEFORE creating the recorder window.
  // If the recorder's getUserMedia fires before macOS grants access,
  // the permission prompt never appears and the request is silently denied.
  const micGranted = smokeTestMode
    ? permissionsService.getMicrophoneStatus() === 'granted'
    : await permissionsService.requestMicrophonePermission();
  logger.info('Microphone permission result', { micGranted });

  // Mini mode keeps the recorder/HUD path hot, but does not auto-open the legacy desktop UI.
  createRecorderWindow();
  floatingWindow.create();
  agentWindow.create();

  // Tray creation must come after agentWindow so we can subscribe to
  // its show/hide events for keeping the menu label in sync.
  createTray();

  // Mode 1 & 2: keyboard hooks require Accessibility permission.
  // Skip uiohook initialization entirely if not granted — it crashes with SIGABRT otherwise.
  const hasAccessibility = permissionsService.getAccessibilityStatus(!smokeTestMode);
  logger.info('Accessibility permission check', { hasAccessibility });
  if (hasAccessibility) {
    voiceModeManager.initialize();
  } else {
    logger.warn('Accessibility not granted — keyboard hooks disabled until permission is given and app is restarted');
    if (!smokeTestMode) {
      permissionsService.openKeyboardPermissionSettings();
    }
    voiceModeManager.initializeQuickAskShortcut();
  }

  // Show notification for any remaining missing permissions
  const missing: string[] = [];
  if (!micGranted) missing.push('麦克风');
  if (!hasAccessibility) missing.push('辅助功能');
  missing.push('输入监控');
  const screenRecGranted = permissionsService.getScreenRecordingStatus() === 'granted';
  if (!screenRecGranted) missing.push('屏幕录制');
  logger.info('Permission summary at startup', {
    micGranted,
    hasAccessibility,
    screenRecGranted,
    bundleId: app.getName(),
    execPath: process.execPath,
  });
  if (missing.length > 0 && !smokeTestMode) {
    permissionsService.showPermissionNotification(missing);
  }

  logger.info('sarah-desk ready in Mini mode. Sarah Debug Console stays hidden until explicitly opened.');

  if (smokeTestMode) {
    setTimeout(() => {
      void runMiniSmokeTestAndQuit();
    }, 300);
  }
});

// On macOS never quit when all windows close — the tray keeps the app alive
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // Re-initialize voice mode manager if it was disposed but app is still running
  if (permissionsService.getAccessibilityStatus() && !voiceModeManager.isRecording) {
    voiceModeManager.initialize();
  }
});

function cleanup(): void {
  globalShortcut.unregisterAll();
  voiceModeManager.dispose();
  floatingWindow.destroy();
  agentWindow.destroy();
  clawDeskMainWindow.destroy();
  miniSettingsWindow.destroy();
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.destroy();
    recorderWindow = null;
  }
  tray?.destroy();
}

app.on('before-quit', () => {
  markAppQuitting();
  setQuitting(true);
});

// Only cleanup on actual quit, not on window-all-closed
app.on('will-quit', cleanup);

process.on('SIGINT', () => { cleanup(); app.quit(); });
process.on('SIGTERM', () => { cleanup(); app.quit(); });
