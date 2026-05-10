const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'docs', 'images');
const preload = path.join(root, '.vite', 'build', 'preload.js');
const floatingHtml = path.join(root, '.vite', 'renderer', 'floating_window', 'floating.html');
const floatingAgentHtml = path.join(root, '.vite', 'renderer', 'floating_window', 'floating-agent.html');
const miniHtml = path.join(root, '.vite', 'renderer', 'mini_settings_window', 'mini-settings.html');
const capturedWindows = [];

const channels = {
  ASR_STATUS: 'asr:status',
  ASR_LEVEL: 'asr:level',
  PUSH_STATE: 'push-to-talk:state',
  AGENT_SHOW_RESULT: 'agent:show-result',
  AGENT_STREAM_CHUNK: 'agent:stream-chunk',
  AGENT_STREAM_DONE: 'agent:stream-done',
  AGENT_GET_DAILY_SUMMARIES: 'agent:get-daily-summaries',
  AGENT_HIDE: 'agent:hide',
  AGENT_SEND_INSTRUCTION: 'agent:send-instruction',
  AGENT_ABORT: 'agent:abort',
  AGENT_SAVE_SESSION: 'agent:save-session',
  AGENT_GET_TODAY_SESSION: 'agent:get-today-session',
  MINI_GET_STATUS: 'mini:get-status',
  MINI_OPEN_PERMISSIONS: 'mini:open-permissions',
  MINI_TOGGLE_DICTATION: 'mini:toggle-dictation',
  MINI_TOGGLE_COMMAND: 'mini:toggle-command',
  MINI_QUIT: 'mini:quit',
  MINI_SHOW_LOGS: 'mini:show-logs',
  MINI_COMPLETE_ONBOARDING: 'mini:complete-onboarding',
  LOCAL_TOOLS_GET_SNAPSHOT: 'local-tools:get-snapshot',
  LOCAL_TOOLS_SET_APPROVAL: 'local-tools:set-approval',
  LOCAL_TOOLS_REVOKE_APPROVAL: 'local-tools:revoke-approval',
  LOCAL_TOOLS_EXECUTE: 'local-tools:execute',
  CLAW_CONNECT_RUNTIME: 'claw-desk:connect-agent-runtime',
};

function registerMocks() {
  const ok = { success: true };
  const invokeMocks = {
    [channels.AGENT_GET_DAILY_SUMMARIES]: [],
    [channels.AGENT_HIDE]: ok,
    [channels.AGENT_SEND_INSTRUCTION]: ok,
    [channels.AGENT_ABORT]: ok,
    [channels.AGENT_SAVE_SESSION]: ok,
    [channels.AGENT_GET_TODAY_SESSION]: null,
    [channels.MINI_GET_STATUS]: createMiniStatus(),
    [channels.MINI_OPEN_PERMISSIONS]: ok,
    [channels.MINI_TOGGLE_DICTATION]: ok,
    [channels.MINI_TOGGLE_COMMAND]: ok,
    [channels.MINI_QUIT]: ok,
    [channels.MINI_SHOW_LOGS]: ok,
    [channels.MINI_COMPLETE_ONBOARDING]: ok,
    [channels.LOCAL_TOOLS_GET_SNAPSHOT]: createLocalToolsSnapshot(),
    [channels.LOCAL_TOOLS_SET_APPROVAL]: createLocalToolsSnapshot(),
    [channels.LOCAL_TOOLS_REVOKE_APPROVAL]: createLocalToolsSnapshot(),
    [channels.LOCAL_TOOLS_EXECUTE]: { ok: true, stdout: '', stderr: '' },
    [channels.CLAW_CONNECT_RUNTIME]: {
      success: true,
      detail: 'OpenClaw Gateway is connected.',
      selection: createMiniStatus().agent,
    },
  };

  for (const [channel, value] of Object.entries(invokeMocks)) {
    ipcMain.handle(channel, () => value);
  }

  ipcMain.on('agent:first-chunk-visible', () => {});
  ipcMain.on('floating-window:set-content-height', () => {});
  ipcMain.on('floating-window:set-audio-level', () => {});
  ipcMain.on('push-to-talk:cancel', () => {});
  ipcMain.on('push-to-talk:confirm', () => {});
  ipcMain.on('recorder:ready', () => {});
  ipcMain.on('recorder:pong', () => {});
}

function ensureAgentHtml() {
  const html = fs.readFileSync(floatingHtml, 'utf8');
  const injected = html.replace(
    '<script type="module"',
    '<script>history.replaceState(null, "", "?mode=agent");</script>\n    <script type="module"',
  );
  fs.writeFileSync(floatingAgentHtml, injected);
}

function createMiniStatus() {
  return {
    mode: 'mini',
    gateway: {
      url: 'http://127.0.0.1:18789',
      state: 'connected',
      detail: 'OpenClaw Gateway is reachable and ready for streaming.',
    },
    asrProvider: {
      name: 'Volcengine ASR',
      configured: true,
      detail: 'Streaming speech recognition configured',
    },
    refinementProvider: {
      name: 'Ark Doubao',
      configured: true,
      detail: 'Dictation refinement configured',
    },
    agent: {
      available: true,
      binaryPath: '/opt/homebrew/bin/openclaw',
      detail: 'OpenClaw Gateway connected',
      selectedRuntime: 'openclaw',
      effectiveRuntime: 'openclaw',
      runtimes: [
        {
          id: 'openclaw',
          name: 'OpenClaw',
          installed: true,
          ready: true,
          path: '/opt/homebrew/bin/openclaw',
          detail: 'Gateway connected for streaming Command and Quick Ask.',
          setupHint: null,
        },
        {
          id: 'hermes',
          name: 'Hermes',
          installed: true,
          ready: true,
          path: '~/.local/bin/hermes',
          detail: 'CLI fallback available.',
          setupHint: null,
        },
      ],
    },
    hotkeys: {
      accessibilityGranted: true,
      keyboardHookActive: true,
      currentVoiceState: 'idle',
      hotkeyConfig: {
        voiceTriggerKey: 'ControlRight',
        customKeycode: null,
        toggleWindow: 'CommandOrControl+Shift+Space',
      },
    },
    recorder: {
      created: true,
      ready: true,
      asrStatus: 'idle',
    },
    permissions: {
      microphone: 'granted',
      accessibility: true,
      screenRecording: 'granted',
      inputMonitoring: true,
    },
    onboarding: {
      completed: false,
      showWelcome: true,
    },
  };
}

function createLocalToolsSnapshot() {
  return {
    tools: [
      {
        id: 'openclaw',
        name: 'OpenClaw',
        category: 'agent',
        description: 'Local agent runtime used by Command and Quick Ask.',
        installed: true,
        path: '/opt/homebrew/bin/openclaw',
        version: 'openclaw 0.5.x',
        authState: 'authenticated',
        health: 'ready',
        detail: 'Gateway WebSocket is reachable.',
        setupHint: null,
        docsUrl: 'https://github.com/openclaw/openclaw',
        capabilities: [
          {
            id: 'agent.ask',
            label: 'Ask agent',
            description: 'Stream Sarah instructions through the local OpenClaw Gateway WebSocket.',
            risk: 'read',
            enabled: true,
            requiresConsent: false,
            commandHint: 'ws://127.0.0.1:18789',
            approval: null,
          },
        ],
        signals: { gatewayReachable: true, gatewayPort: 18789 },
        checkedAt: Date.now(),
      },
      {
        id: 'lark-cli',
        name: 'Feishu / Lark CLI',
        category: 'productivity',
        description: 'Local CLI bridge for Feishu/Lark docs, messages, calendar, and tasks.',
        installed: true,
        path: '/opt/homebrew/bin/lark-cli',
        version: 'lark-cli 1.x',
        authState: 'authenticated',
        health: 'ready',
        detail: 'Docs, Drive, Wiki, and IM command families detected.',
        setupHint: null,
        docsUrl: null,
        capabilities: [
          {
            id: 'docs.create',
            label: 'Create docs',
            description: 'Create or update Feishu/Lark docs with explicit approval.',
            risk: 'write',
            enabled: true,
            requiresConsent: true,
            commandHint: 'lark-cli docs',
            approval: { scope: 'session', grantedAt: Date.now() },
          },
        ],
        signals: { command: 'lark-cli' },
        checkedAt: Date.now(),
      },
      {
        id: 'obsidian',
        name: 'Obsidian',
        category: 'knowledge',
        description: 'Local knowledge base target for notes and memory export.',
        installed: true,
        path: '/Applications/Obsidian.app',
        version: null,
        authState: 'not_required',
        health: 'ready',
        detail: 'Obsidian app detected.',
        setupHint: null,
        docsUrl: 'https://help.obsidian.md/',
        capabilities: [],
        signals: { appDetected: true },
        checkedAt: Date.now(),
      },
    ],
    ready: 3,
    needsSetup: 0,
    missing: 0,
    checkedAt: Date.now(),
  };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, label, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function captureWindow({ name, width, height, url, file, query, setup, backgroundColor = '#00000000', zoom = 1 }) {
  console.log(`Capturing ${name}...`);
  const win = new BrowserWindow({
    width,
    height,
    show: true,
    frame: false,
    transparent: backgroundColor === '#00000000',
    backgroundColor,
    resizable: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: false,
    },
  });

  win.webContents.setZoomFactor(zoom);
  await withTimeout(file ? win.loadFile(file, query ? { query } : undefined) : win.loadURL(url), `load ${name}`);
  await wait(250);
  await setup?.(win);
  await wait(900);
  const image = await withTimeout(win.webContents.capturePage(), `capture ${name}`);
  const output = path.join(outputDir, name);
  fs.writeFileSync(output, image.toPNG());
  capturedWindows.push(win);
  return output;
}

async function main() {
  if (!fs.existsSync(preload) || !fs.existsSync(floatingHtml) || !fs.existsSync(miniHtml)) {
    throw new Error('Build output missing. Run `pnpm package` before capturing README screenshots.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  ensureAgentHtml();
  registerMocks();

  const floatingUrl = pathToFileURL(floatingHtml).toString();
  const miniUrl = pathToFileURL(miniHtml).toString();

  const outputs = [];
  outputs.push(await captureWindow({
    name: 'product-recording.png',
    width: 300,
    height: 80,
    url: floatingUrl,
    zoom: 2,
    setup: async (win) => {
      win.webContents.send(channels.PUSH_STATE, { mode: 'dictation', phase: 'recording' });
      win.webContents.send(channels.ASR_STATUS, 'listening');
      win.webContents.send(channels.ASR_LEVEL, 0.72);
    },
  }));

  outputs.push(await captureWindow({
    name: 'product-command.png',
    width: 760,
    height: 520,
    url: pathToFileURL(floatingAgentHtml).toString(),
    setup: async (win) => {
      win.webContents.send(channels.AGENT_SHOW_RESULT, {
        transcript: '整理当前 Codex 页面，并把结论保存到飞书项目文档。',
        context: {
          appName: 'Codex',
          windowTitle: 'open-typeless · implementation review',
          url: '',
          screenshotPath: '/tmp/sarah-command-context.png',
        },
        result: [
          '已读取当前窗口上下文，并整理成三部分：',
          '',
          '1. 本轮改动：OpenClaw Gateway WebSocket 流式接入已完成。',
          '2. 风险点：Hermes 仍是 CLI fallback，需要等待 native streaming API。',
          '3. 下一步：把验证截图和 README 产品介绍补齐。',
          '',
          '飞书写入会走本机 `lark-cli docs`，写入前保留明确授权边界。',
        ].join('\n'),
        isError: false,
      });
    },
  }));

  outputs.push(await captureWindow({
    name: 'product-quick-ask.png',
    width: 760,
    height: 520,
    url: pathToFileURL(floatingAgentHtml).toString(),
    setup: async (win) => {
      win.webContents.send(channels.AGENT_SHOW_RESULT, {
        transcript: '这个页面现在最重要的三件事是什么？',
        context: {
          appName: 'Safari',
          windowTitle: 'Sarah project README',
          url: 'https://github.com/DHLbigmonster/sarah-desk',
          screenshotPath: '',
        },
        result: [
          '最重要的是：',
          '',
          '- Sarah 有三个固定入口：Dictation、Command、Quick Ask。',
          '- Command 会携带当前 App/窗口/截图上下文，让 agent 能直接处理眼前任务。',
          '- Quick Ask 用同一个浮层展示 Markdown 答案，并支持复制、重试和继续追问。',
        ].join('\n'),
        isError: false,
      });
    },
  }));

  outputs.push(await captureWindow({
    name: 'product-onboarding.png',
    width: 420,
    height: 900,
    url: miniUrl,
    backgroundColor: '#1a1a1a',
    setup: async (win) => {
      await win.webContents.insertCSS('::-webkit-scrollbar{display:none!important}.shell{overflow:hidden!important}');
    },
  }));

  console.log(outputs.map((file) => path.relative(root, file)).join('\n'));
  for (const win of capturedWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
}

app.whenReady()
  .then(main)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
