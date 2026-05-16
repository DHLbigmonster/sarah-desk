#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const checks: Array<{ name: string; success: boolean; detail: string }> = [];

function rel(filePath: string): string {
  return path.relative(root, filePath);
}

function read(filePath: string): string {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function add(name: string, success: boolean, detail: string): void {
  checks.push({ name, success, detail });
  const status = success ? 'PASS' : 'FAIL';
  console.log(`${status} ${name} - ${detail}`);
}

function exists(filePath: string): boolean {
  const ok = fs.existsSync(path.join(root, filePath));
  add(`file:${filePath}`, ok, ok ? 'exists' : `missing ${filePath}`);
  return ok;
}

function contains(filePath: string, needle: string, label = needle): boolean {
  const fullPath = path.join(root, filePath);
  const ok = fs.existsSync(fullPath) && fs.readFileSync(fullPath, 'utf8').includes(needle);
  add(`content:${label}`, ok, ok ? `${filePath} contains ${label}` : `${filePath} missing ${label}`);
  return ok;
}

function regex(filePath: string, pattern: RegExp, label: string): boolean {
  const fullPath = path.join(root, filePath);
  const ok = fs.existsSync(fullPath) && pattern.test(fs.readFileSync(fullPath, 'utf8'));
  add(`content:${label}`, ok, ok ? `${filePath} matches ${label}` : `${filePath} missing ${label}`);
  return ok;
}

let asarModule: typeof import('@electron/asar') | null = null;

async function getAsarModule(): Promise<typeof import('@electron/asar')> {
  asarModule ??= await import('@electron/asar');
  return asarModule;
}

async function asarList(asarPath: string): Promise<string> {
  const { listPackage } = await getAsarModule();
  return listPackage(asarPath, { isPack: true }).join('\n');
}

async function extractAsarToTemp(asarPath: string): Promise<string> {
  const { extractAll } = await getAsarModule();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarah-mini-verify-'));
  extractAll(asarPath, outDir);
  return outDir;
}

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function section(title: string): void {
  console.log(`\n## ${title}`);
}

section('Static source checks');

[
  'src/main.ts',
  'index.html',
  'src/preload.ts',
  'src/renderer.ts',
  'src/main/services/asr/asr.service.ts',
  'src/main/services/keyboard/keyboard.service.ts',
  'src/main/services/push-to-talk/voice-mode-manager.ts',
  'src/main/services/agent/dictation-refinement.service.ts',
  'src/main/services/local-tools/local-tools.service.ts',
  'src/main/services/local-tools/approval-store.ts',
  'src/main/services/local-tools/executor.ts',
  'src/main/services/text-input/text-input.service.ts',
  'scripts/ocr-image.swift',
  'src/main/ipc/asr.handler.ts',
  'src/main/ipc/local-tools.handler.ts',
  'src/main/windows/floating.ts',
  'src/main/windows/mini-settings.ts',
  'src/main/windows/menubar-popover.ts',
  'menubar-popover.html',
  'forge.config.ts',
  'vite.renderer.config.ts',
  'vite.mini-settings.config.ts',
  'vite.menubar-popover.config.ts',
].forEach(exists);

contains('src/main.ts', 'let recorderWindow: BrowserWindow | null = null', 'recorderWindow declaration');
contains('src/main.ts', 'function createRecorderWindow()', 'recorderWindow create function');
contains('src/main.ts', 'createRecorderWindow();', 'recorderWindow startup call');
contains('index.html', '/src/renderer.ts', 'recorder html renderer entry');
contains('src/preload.ts', 'sendAudio', 'preload exposes sendAudio');
contains('src/preload.ts', 'onNotice', 'preload exposes ASR notice listener');
contains('src/preload.ts', 'signalRecorderReady', 'preload exposes recorder ready');
contains('src/preload.ts', 'onRecorderPing', 'preload exposes recorder ping listener');
contains('src/preload.ts', 'localToolsApi', 'preload exposes local tools API');
contains('src/main/ipc/asr.handler.ts', 'IPC_CHANNELS.ASR.SEND_AUDIO', 'main handles ASR audio chunks');
contains('src/main/ipc/index.ts', 'setupLocalToolsHandlers()', 'main registers local tools IPC handlers');
contains('src/renderer.ts', 'window.api.asr.sendAudio(chunk)', 'renderer sends audio chunks');
contains('src/renderer.ts', 'window.api.mini.signalRecorderReady()', 'renderer sends recorder ready');
contains('src/renderer.ts', 'window.api.mini.sendRecorderPong', 'renderer sends recorder pong');
contains('src/main/services/push-to-talk/voice-mode-manager.ts', 'await asrService.start()', 'VoiceModeManager starts ASR');
contains('src/main/services/push-to-talk/voice-mode-manager.ts', 'await asrService.stop()', 'VoiceModeManager stops ASR');
contains('src/main/services/push-to-talk/voice-mode-manager.ts', 'dictationRefinementService.refine', 'dictation refinement after ASR');
contains('src/main/services/push-to-talk/voice-mode-manager.ts', 'textInputService.insert', 'text insertion after refinement');
contains('src/main/services/push-to-talk/voice-mode-manager.ts', '/usr/bin/afplay', 'voice cue sound playback on mode start/stop');
contains('src/main/services/push-to-talk/voice-mode-manager.ts', 'floatingWindow.sendNotice', 'clipboard fallback success notice');
contains('src/main/services/text-input/text-input.service.ts', 'clipboard.writeText', 'dictation clipboard fallback');
contains('src/main/services/text-input/text-input.service.ts', 'AXFocusedUIElement', 'focused text target detection');
contains('src/shared/types/clawdesk-settings.ts', "'codex' | 'claude'", 'Codex and Claude runtime ids');
contains('src/main/services/hotkey/hotkey-manager.ts', 'checkVoiceTrigger', 'voice trigger conflict check');
contains('src/renderer/mini-settings/index.ts', '录入按键', 'custom hotkey recording UI');
contains('src/renderer/mini-settings/index.ts', 'runtimeOptions', 'four-runtime Mini selector');
contains('src/renderer/menubar-popover/index.tsx', '屏幕录制', 'Chinese menubar permission label');
contains('src/main.ts', 'getScreenRecordingStatusForUi', 'screen permission probe for UI');
contains('src/main/services/agent/agent.service.ts', "this.codexBin = resolveBinary('codex')", 'AgentService resolves Codex CLI');
contains('src/main/services/agent/agent.service.ts', "this.claudeBin = resolveBinary('claude')", 'AgentService resolves Claude Code CLI');
contains('src/main/services/agent/agent.service.ts', 'const topLevelItem', 'Codex JSONL top-level item parser');
contains('src/main/services/agent/agent.service.ts', 'parseClaudeStreamJsonLine', 'Claude stream-json parser');
contains('src/main/services/agent/agent.service.ts', '--output-format', 'Claude Code stream-json spawn args');
contains('src/main/services/agent/agent.service.ts', 'computer_use', 'Hermes Computer Use toolset gating');
contains('src/main/services/agent/context-capture.service.ts', 'captureScreenshotOcr', 'screen OCR context capture');
contains('src/main/services/local-tools/local-tools.service.ts', 'hermes-computer-use', 'Hermes Computer Use local tool');
contains('src/main/services/local-tools/local-tools.service.ts', 'openclaw-peekaboo', 'OpenClaw peekaboo local tool');
contains('src/main/services/local-tools/local-tools.service.ts', 'visible-context.create-doc', 'Feishu visible-context document capability');
contains('src/main/services/local-tools/executor.ts', 'hermes computer-use install', 'Hermes Computer Use setup executor');
contains('src/main/services/local-tools/executor.ts', 'openclaw skills info peekaboo', 'OpenClaw Peekaboo setup executor');
contains('src/main/services/local-tools/executor.ts', 'lark-cli.visible-context.create-doc', 'Feishu visible-context document executor');
contains('src/main/services/clawdesk/settings.service.ts', 'cua-driver', 'cua-driver catalog and status');
contains('src/renderer/mini-settings/index.ts', '屏幕 OCR', 'onboarding Screen OCR check');
contains('src/renderer/mini-settings/index.ts', '桌面自动化', 'onboarding desktop automation check');
contains('src/renderer/mini-settings/index.ts', '飞书工作流', 'onboarding Feishu workflow check');
contains('src/renderer/mini-settings/index.ts', 'executeLocalTool', 'local tool setup run action');
contains('src/renderer/src/modules/agent/AgentWindow.tsx', 'agent-window__timeline', 'Action Timeline UI');
contains('src/renderer/src/modules/agent/AgentWindow.tsx', 'handleSaveToFeishu', 'Agent overlay Feishu save action');
contains('src/renderer/src/modules/agent/AgentWindow.tsx', '存飞书', 'Agent overlay Feishu button');
contains('src/renderer/src/styles/components/agent-window.css', 'agent-window__action-btn--feishu', 'Agent overlay Feishu button styling');
contains('src/main.ts', 'new Tray(icon)', 'tray/menu bar creation');
contains('src/main.ts', 'Open Logs', 'Logs menu item');
contains('src/main.ts', 'miniSettingsWindow.show()', 'Mini Settings menu item');
contains('src/main.ts', 'menubarPopoverWindow.toggle(tray.getBounds())', 'custom menubar popover click');
regex('src/main.ts', /app\.on\('ready'[\s\S]*?createTray\(\);[\s\S]*?logger\.info\('sarah-desk ready in Mini mode/, 'Mini startup path');

const readyBlock = read('src/main.ts').match(/app\.on\('ready'[\s\S]*?\n\}\);/);
const readySource = readyBlock ? readyBlock[0] : '';
add(
  'default-startup:no-debug-console-show',
  !readySource.includes('clawDeskMainWindow.show()'),
  readySource.includes('clawDeskMainWindow.show()')
    ? 'app ready still opens Sarah Debug Console'
    : 'app ready does not open Sarah Debug Console',
);

section('IPC string checks');

[
  'asr:send-audio',
  'asr:start',
  'asr:stop',
  'asr:notice',
  'recorder:ready',
  'recorder:ping',
  'recorder:pong',
  'mini:toggle-quick-ask',
  'claw-desk:check-voice-trigger',
  'mini:test-recorder-window',
  'mini:test-ipc',
  'mini:test-asr-mock',
  'mini:test-text-insert-mock',
  'local-tools:get-snapshot',
  'local-tools:set-approval',
  'local-tools:revoke-approval',
  'local-tools:execute',
  'mini:complete-onboarding',
].forEach((needle) => contains('src/shared/constants/channels.ts', needle, needle));

section('Build config checks');

contains('vite.renderer.config.ts', "input: 'index.html'", 'recorder html build input');
contains('forge.config.ts', "entry: 'src/preload.ts'", 'preload build target');
contains('forge.config.ts', "name: 'main_window'", 'recorder renderer forge target');
contains('forge.config.ts', "name: 'mini_settings_window'", 'mini settings forge target');
contains('forge.config.ts', "name: 'menubar_popover_window'", 'menubar popover forge target');
contains('src/main.ts', 'MAIN_WINDOW_VITE_DEV_SERVER_URL', 'dev server recorder path');
contains('src/main.ts', '../renderer/${MAIN_WINDOW_VITE_NAME}/index.html', 'packaged recorder path');
contains('src/main/windows/mini-settings.ts', 'MINI_SETTINGS_WINDOW_VITE_DEV_SERVER_URL', 'dev server mini settings path');
contains('src/main/windows/mini-settings.ts', '../renderer/${MINI_SETTINGS_WINDOW_VITE_NAME}/mini-settings.html', 'packaged mini settings path');
contains('src/main/windows/menubar-popover.ts', 'MENUBAR_POPOVER_WINDOW_VITE_DEV_SERVER_URL', 'dev server menubar popover path');
contains('src/main/windows/menubar-popover.ts', '../renderer/${MENUBAR_POPOVER_WINDOW_VITE_NAME}/menubar-popover.html', 'packaged menubar popover path');

const isCI = process.env.CI === 'true';

if (isCI) {
  section('Packaged app checks (skipped in CI)');
  add('packaged:skipped', true, 'skipped — CI does not run npm run package');
} else {
  section('Packaged app checks');

  const appPath = path.join(root, 'out/Sarah-darwin-arm64/Sarah.app');
  const appAsarPath = path.join(appPath, 'Contents/Resources/app.asar');
  const appExePath = path.join(appPath, 'Contents/MacOS/Sarah');
  const appExists = fs.existsSync(appPath);
  add('packaged:app-exists', appExists, appExists ? rel(appPath) : 'missing packaged .app; run npm run package');

  if (fs.existsSync(appAsarPath)) {
    try {
      const list = await asarList(appAsarPath);
      [
        '/.vite/build/main.js',
        '/.vite/build/preload.js',
        '/.vite/renderer/main_window/index.html',
        '/.vite/renderer/floating_window/floating.html',
        '/.vite/renderer/mini_settings_window/mini-settings.html',
        '/.vite/renderer/menubar_popover_window/menubar-popover.html',
      ].forEach((entry) => {
        add(`packaged:${entry}`, list.includes(entry), list.includes(entry) ? 'present in app.asar' : 'missing from app.asar');
      });

      const extractedDir = await extractAsarToTemp(appAsarPath);
      const mainBundle = readIfExists(path.join(extractedDir, '.vite/build/main.js'));
      const preloadBundle = readIfExists(path.join(extractedDir, '.vite/build/preload.js'));
      const recorderBundleNames = list
        .split('\n')
        .filter((line) => line.includes('/.vite/renderer/main_window/assets/') && line.endsWith('.js'));
      const recorderBundle = recorderBundleNames[0]
        ? readIfExists(path.join(extractedDir, recorderBundleNames[0].replace(/^\//, '')))
        : '';

      add('packaged:string:asr-send-audio', (mainBundle + preloadBundle + recorderBundle).includes('asr:send-audio'), 'asr:send-audio string search in bundles');
      add('packaged:string:recorder-ready', (mainBundle + preloadBundle + recorderBundle).includes('recorder:ready'), 'recorder:ready string search in bundles');
      add('packaged:string:recorder-ping', (mainBundle + preloadBundle + recorderBundle).includes('recorder:ping'), 'recorder:ping string search in bundles');
    } catch (error) {
      add('packaged:asar-readable', false, error instanceof Error ? error.message : String(error));
    }
  } else {
    add('packaged:app.asar-exists', false, `missing ${rel(appAsarPath)}`);
  }

  const unpackedNativeRoot = path.join(appPath, 'Contents/Resources/app.asar.unpacked/node_modules');
  add('packaged:native:uiohook', fs.existsSync(path.join(unpackedNativeRoot, 'uiohook-napi')), 'uiohook-napi unpacked module');
  add('packaged:native:text-insert', fs.existsSync(path.join(unpackedNativeRoot, '@xitanggg/node-insert-text-darwin-arm64')), 'node-insert-text unpacked module');

  section('Packaged smoke test');

  if (fs.existsSync(appExePath)) {
    try {
      const output = execFileSync(appExePath, [], {
        cwd: root,
        encoding: 'utf8',
        timeout: 20000,
        env: { ...process.env, SARAH_SMOKE_TEST: '1' },
        maxBuffer: 10 * 1024 * 1024,
      });
      const marker = output.match(/MINI_SMOKE_TEST_RESULTS (.+)/);
      if (!marker) {
        add('smoke:marker', false, 'packaged app exited without MINI_SMOKE_TEST_RESULTS');
      } else {
        const smokeResults = JSON.parse(marker[1]);
        for (const result of smokeResults) {
          add(`smoke:${result.name}`, Boolean(result.success), result.detail);
        }
      }
    } catch (error) {
      add('smoke:packaged-app', false, error instanceof Error ? error.message : String(error));
    }
  } else {
    add('smoke:packaged-app', false, `missing executable ${rel(appExePath)}`);
  }
} // end if (!isCI)

section('Summary');

const failed = checks.filter((check) => !check.success);
console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed.length}/${checks.length} checks passed`);

if (failed.length > 0) {
  console.log('\nFailures:');
  for (const failure of failed) {
    console.log(`- ${failure.name}: ${failure.detail}`);
  }
  process.exitCode = 1;
}
