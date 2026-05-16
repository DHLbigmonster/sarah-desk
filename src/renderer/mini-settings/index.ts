import type { MiniStatus } from '../../shared/types/mini';
import type { DailySummary } from '../../shared/types/agent';
import type {
  LocalToolApprovalScope,
  LocalToolCapability,
  LocalToolHealth,
  LocalToolId,
  LocalToolsSnapshot,
  LocalToolStatus,
} from '../../shared/types/local-tools';
import {
  SAFE_TRIGGER_KEYS,
  VOICE_TRIGGER_KEY_LABELS,
  type AgentRuntimeId,
  type AgentRuntimeStatus,
  type HotkeyConfig,
  type HotkeyCheckResult,
  type VoiceTriggerKey,
} from '../../shared/types/clawdesk-settings';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Mini settings root element not found');
}

const root = rootElement;
let notice: { tone: 'ok' | 'warn' | 'error'; message: string } | null = null;
let customCaptureActive = false;
let lastRenderState: { status: MiniStatus; localTools: LocalToolsSnapshot; summaries: DailySummary[] } | null = null;

const DOM_CODE_TO_UIOHOOK = new Map<string, number>([
  ['ControlRight', 3613],
  ['AltRight', 3640],
  ['MetaRight', 3676],
  ['CapsLock', 58],
  ['F1', 59],
  ['F2', 60],
  ['F3', 61],
  ['F4', 62],
  ['F5', 63],
  ['F6', 64],
  ['F7', 65],
  ['F8', 66],
  ['F9', 67],
  ['F10', 68],
  ['F11', 87],
  ['F12', 88],
  ['F18', 101],
  ['F19', 102],
]);

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hotkeyHint(config: HotkeyConfig): string {
  const label = config.voiceTriggerKey === 'custom'
    ? `按键 ${config.customKeycode ?? '?'}`
    : (VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey);
  return `听写 ${label} · 命令 + Shift · 快问 + Space`;
}

function hotkeyLabel(config: HotkeyConfig): string {
  return config.voiceTriggerKey === 'custom'
    ? `按键 ${config.customKeycode ?? '?'}`
    : (VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey);
}

function formatKeyEvent(event: KeyboardEvent): string {
  if (event.code.startsWith('Key')) return event.code.replace(/^Key/, '');
  if (event.code.startsWith('Digit')) return event.code.replace(/^Digit/, '');
  return event.code || event.key || 'Unknown';
}

function conflictMessage(result: HotkeyCheckResult): string {
  return result.conflicts.map((conflict) => conflict.message).join(' ');
}

function shortcutDeck(config: HotkeyConfig): string {
  const label = hotkeyLabel(config);
  return `
    <div class="shortcut-deck" aria-label="Shortcut modes">
      <div class="shortcut-token active">
        <span>听写</span>
        <kbd>${escapeHtml(label)}</kbd>
      </div>
      <div class="shortcut-token">
        <span>命令</span>
        <kbd>${escapeHtml(label)} + Shift</kbd>
      </div>
      <div class="shortcut-token">
        <span>快问</span>
        <kbd>${escapeHtml(label)} + Space</kbd>
      </div>
    </div>
  `;
}

function renderNotice(): string {
  if (!notice) return '';
  return `<div class="notice ${notice.tone}">${escapeHtml(notice.message)}</div>`;
}

function findLocalTool(localTools: LocalToolsSnapshot, id: LocalToolId): LocalToolStatus | null {
  return localTools.tools.find((tool) => tool.id === id) ?? null;
}

function hotkeyPicker(config: HotkeyConfig, disabled: boolean): string {
  const buttons = SAFE_TRIGGER_KEYS.map((key) => {
    const selected = config.voiceTriggerKey === key;
    return `
      <button
        class="trigger-key ${selected ? 'selected' : ''}"
        type="button"
        data-trigger-key="${escapeHtml(key)}"
        ${disabled ? 'disabled' : ''}
      >
        ${escapeHtml(VOICE_TRIGGER_KEY_LABELS[key])}
      </button>
    `;
  }).join('');

  const currentLabel = config.voiceTriggerKey === 'custom'
    ? `自定义 keycode ${config.customKeycode ?? '?'}`
    : VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey];
  const disabledCopy = disabled
    ? 'Stop the current recording before changing shortcuts.'
    : '选择预设键、录入外接按键，或填写 uiohook keycode。保存前会自动检查冲突。';
  const customValue = config.voiceTriggerKey === 'custom' && config.customKeycode
    ? String(config.customKeycode)
    : '';

  return `
    <section class="hotkey-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">快捷键</span>
          <h2>${escapeHtml(currentLabel)}</h2>
        </div>
        <span class="section-detail">${escapeHtml(disabled ? 'Recording' : 'Live')}</span>
      </div>
      <p class="section-copy">${escapeHtml(disabledCopy)}</p>
      ${shortcutDeck(config)}
      <div class="trigger-grid">${buttons}</div>
      <div class="custom-trigger-row">
        <button
          class="trigger-key custom-trigger ${customCaptureActive ? 'selected' : ''}"
          type="button"
          data-custom-trigger="capture"
          ${disabled ? 'disabled' : ''}
        >
          ${escapeHtml(customCaptureActive ? '请按下按键...' : '录入按键')}
        </button>
        <label class="custom-keycode-field">
          <span>Keycode</span>
          <input id="custom-keycode" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(customValue)}" ${disabled ? 'disabled' : ''} />
        </label>
        <button class="trigger-key custom-apply" type="button" data-custom-trigger="apply" ${disabled ? 'disabled' : ''}>使用</button>
      </div>
    </section>
  `;
}

function runtimeTone(runtime: AgentRuntimeStatus): 'ok' | 'warn' | 'error' {
  if (runtime.ready) return 'ok';
  return runtime.installed ? 'warn' : 'error';
}

function runtimeLabel(runtimeId: AgentRuntimeId | null): string {
  if (runtimeId === 'hermes') return 'Hermes';
  if (runtimeId === 'codex') return 'Codex';
  if (runtimeId === 'claude') return 'Claude';
  if (runtimeId === 'openclaw') return 'OpenClaw';
  return 'Not found';
}

function runtimeOptions(status: MiniStatus): AgentRuntimeStatus[] {
  const names: Record<AgentRuntimeId, string> = {
    openclaw: 'OpenClaw',
    hermes: 'Hermes',
    codex: 'Codex CLI',
    claude: 'Claude Code',
  };
  const hints: Record<AgentRuntimeId, string> = {
    openclaw: '安装 OpenClaw 并启动 Gateway。',
    hermes: '安装 Hermes CLI 并完成模型配置。',
    codex: '安装 OpenAI Codex CLI 并登录。',
    claude: '安装 Claude Code CLI 并登录。',
  };
  const byId = new Map(status.agent.runtimes.map((runtime) => [runtime.id, runtime]));
  return (['openclaw', 'hermes', 'codex', 'claude'] as AgentRuntimeId[]).map((id) => byId.get(id) ?? {
    id,
    name: names[id],
    installed: false,
    path: null,
    version: null,
    authenticated: false,
    ready: false,
    detail: hints[id],
    setupHint: hints[id],
  });
}

function runtimeCard(status: MiniStatus): string {
  const options = runtimeOptions(status);
  const buttons = options.map((runtime) => {
    const selected = status.agent.effectiveRuntime === runtime.id;
    const tone = runtimeTone(runtime);
    const state = runtime.ready ? '可用' : runtime.installed ? '待配置' : '未安装';
    const action = selected && runtime.ready ? '使用中' : runtime.ready ? '使用' : runtime.installed ? '配置' : '安装';
    return `
      <button
        class="runtime-option ${selected ? 'selected' : ''}"
        type="button"
        data-runtime-id="${escapeHtml(runtime.id)}"
        title="${escapeHtml(runtime.detail)}"
      >
        <span class="runtime-top">
          <span class="status-dot ${tone}"></span>
          <span class="runtime-name">${escapeHtml(runtime.name)}</span>
          <span class="runtime-state ${tone}">${escapeHtml(state)}</span>
        </span>
        <span class="runtime-bottom">
          <span class="runtime-detail">${escapeHtml(runtime.path ? runtime.path.replace(/^\/Users\/[^/]+/, '~') : runtime.setupHint ?? runtime.detail ?? '未配置')}</span>
          <span class="runtime-action">${escapeHtml(action)}</span>
        </span>
      </button>
    `;
  }).join('');
  const active = options.find((runtime) => runtime.id === status.agent.effectiveRuntime);
  const detail = active?.ready
    ? `${active.name} 将处理“命令”和“快问”。`
    : '可选择 OpenClaw、Hermes、Codex CLI 或 Claude Code；缺失时 Sarah 会引导安装配置。';

  return `
    <section class="runtime-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">代理运行时</span>
          <h2>${escapeHtml(active?.name ?? '选择运行时')}</h2>
        </div>
        <span class="section-detail ${active?.ready ? 'ok' : 'warn'}">${escapeHtml(`${status.agent.selectedRuntime ? '手动' : '自动'} · ${options.length}`)}</span>
      </div>
      <p class="section-copy">${escapeHtml(detail)}</p>
      <div class="runtime-switcher">${buttons}</div>
    </section>
  `;
}

function localToolTone(health: LocalToolHealth): string {
  switch (health) {
    case 'ready':
      return 'ok';
    case 'needs_setup':
      return 'warn';
    case 'missing':
      return 'error';
    default:
      return 'warn';
  }
}

function renderCapability(toolId: LocalToolId, capability: LocalToolCapability): string {
  const approved = Boolean(capability.approval);
  const consent = capability.requiresConsent;
  const dataset = `data-tool-id="${escapeHtml(toolId)}" data-capability-id="${escapeHtml(capability.id)}"`;
  const stateText = !consent
    ? 'safe'
    : approved
      ? `approved · ${capability.approval?.scope ?? 'always'}`
      : 'needs approval';
  const runAction = approved && capability.id === 'setup'
    ? `<button class="chip-action run" data-execute-action="run" ${dataset} type="button">Run</button>`
    : '';
  const action = !consent
    ? ''
    : approved
      ? `${runAction}<button class="chip-action revoke" data-approval-action="revoke" ${dataset} type="button">Revoke</button>`
      : `<button class="chip-action approve" data-approval-action="approve" ${dataset} type="button">Approve</button>`;
  return `
    <span class="tool-chip ${consent ? 'consent' : ''} ${approved ? 'approved' : ''}" title="${escapeHtml(capability.description)}">
      <span class="chip-label">${escapeHtml(capability.label)}</span>
      <span class="chip-state">${escapeHtml(stateText)}</span>
      ${action}
    </span>
  `;
}

function renderCapabilities(tool: LocalToolStatus): string {
  const enabled = tool.capabilities.filter((capability) => capability.enabled);
  if (enabled.length === 0) {
    return '<span class="tool-chip muted">No enabled actions</span>';
  }
  return enabled.slice(0, 4).map((capability) => renderCapability(tool.id, capability)).join('');
}

function renderLocalTool(tool: LocalToolStatus): string {
  const tone = localToolTone(tool.health);
  const pathLabel = tool.path ? tool.path.replace(/^\/Users\/[^/]+/, '~') : (tool.setupHint ?? 'Not configured');
  const healthLabel = tool.health ? tool.health.replace('_', ' ') : 'unknown';
  return `
    <div class="tool-row">
      <span class="status-dot ${tone}"></span>
      <div class="tool-body">
        <div class="tool-main">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-state ${tone}">${escapeHtml(healthLabel)}</span>
        </div>
        <span class="tool-detail">${escapeHtml(tool.detail)}</span>
        <div class="tool-chips">${renderCapabilities(tool)}</div>
      </div>
      <span class="tool-path">${escapeHtml(pathLabel)}</span>
    </div>
  `;
}

function localToolsCard(snapshot: LocalToolsSnapshot): string {
  const tone = snapshot.missing > 0 ? 'warn' : snapshot.needsSetup > 0 ? 'warn' : 'ok';
  return `
    <details class="local-tools-card advanced-tools">
      <summary>
        <span>
          <span class="section-kicker">高级集成</span>
          <strong>${snapshot.ready} 个可用 · ${snapshot.needsSetup} 个待配置</strong>
        </span>
        <span class="section-detail ${tone}">${snapshot.tools.length} tools</span>
      </summary>
      <p class="section-copy">这里是 OpenClaw、Hermes、Obsidian、飞书等外部集成。日常听写/快问不需要操作这里。</p>
      <div class="tool-list">
        ${snapshot.tools.map(renderLocalTool).join('')}
      </div>
    </details>
  `;
}

function voiceStateLabel(state: string): string {
  switch (state) {
    case 'idle':
      return '空闲';
    case 'dictation_recording':
      return '听写中...';
    case 'command_recording':
      return '命令中...';
    case 'quickask_recording':
      return '快问中...';
    default:
      return state;
  }
}

function voiceStateClass(state: string): string {
  return state === 'idle' ? 'ok' : 'warn';
}

function gatewayStateClass(state: string): string {
  switch (state) {
    case 'connected':
      return 'ok';
    case 'loading':
      return 'warn';
    default:
      return 'error';
  }
}

function gatewayUrlLabel(status: MiniStatus): string {
  return (status.gateway.url || status.gateway.detail || '网关不可用').replace(/^https?:\/\//, '');
}

function providerStateClass(configured: boolean): string {
  return configured ? 'ok' : 'warn';
}

function healthSummary(status: MiniStatus, missingPerms: string[], recorderReady: boolean): { tone: string; label: string; detail: string } {
  if (missingPerms.length > 0) {
    return {
      tone: 'warn',
      label: `${missingPerms.length} 项权限需要处理`,
      detail: missingPerms.join('、'),
    };
  }
  if (!status.agent.available) {
    return {
      tone: 'error',
      label: '代理不可用',
      detail: '使用“命令/快问”前，请先连接 Hermes、OpenClaw、Codex 或 Claude',
    };
  }
  if (!recorderReady) {
    return {
      tone: 'warn',
      label: '录音器启动中',
      detail: status.recorder.asrStatus,
    };
  }
  return {
    tone: 'ok',
    label: '语音功能就绪',
    detail: hotkeyHint(status.hotkeys.hotkeyConfig),
  };
}

interface WelcomeCheckItem {
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'error';
  done: boolean;
}

function buildWelcomeChecklist(status: MiniStatus, localTools: LocalToolsSnapshot): WelcomeCheckItem[] {
  const perms = status.permissions;
  const larkCli = findLocalTool(localTools, 'lark-cli');
  const hermesComputerUse = findLocalTool(localTools, 'hermes-computer-use');
  const openclawPeekaboo = findLocalTool(localTools, 'openclaw-peekaboo');
  const desktopControlReady = hermesComputerUse?.health === 'ready' || openclawPeekaboo?.health === 'ready';
  const desktopControlSetup = [hermesComputerUse, openclawPeekaboo]
    .filter((tool): tool is LocalToolStatus => Boolean(tool))
    .filter((tool) => tool.health === 'needs_setup')
    .map((tool) => tool.name)
    .join(', ');
  return [
    {
      label: '麦克风权限',
      detail: perms.microphone === 'granted' ? '已授权' : '允许 Sarah 使用麦克风',
      tone: perms.microphone === 'granted' ? 'ok' : 'warn',
      done: perms.microphone === 'granted',
    },
    {
      label: '辅助功能',
      detail: perms.accessibility ? '已授权' : '用于全局按住说话快捷键',
      tone: perms.accessibility ? 'ok' : 'warn',
      done: perms.accessibility,
    },
    {
      label: '输入监控',
      detail: perms.inputMonitoring ? '已授权' : '用于捕获全局触发键',
      tone: perms.inputMonitoring ? 'ok' : 'warn',
      done: perms.inputMonitoring,
    },
    {
      label: '屏幕 OCR',
      detail: perms.screenRecording === 'granted'
        ? '已授权；Sarah 可以读取当前屏幕文字'
        : '授权屏幕录制后可读取 Telegram、PDF 等可见文字',
      tone: perms.screenRecording === 'granted' ? 'ok' : 'warn',
      done: perms.screenRecording === 'granted',
    },
    {
      label: '语音识别',
      detail: status.asrProvider.configured
        ? `${status.asrProvider.name} 已配置`
        : 'Apple Speech 本地降级可用',
      tone: 'ok',
      done: true,
    },
    {
      label: '代理运行时',
      detail: status.agent.available
        ? `${runtimeLabel(status.agent.effectiveRuntime)} 可处理“命令”和“快问”`
        : '连接 OpenClaw、Hermes、Codex 或 Claude 后才能使用“命令/快问”',
      tone: status.agent.available ? 'ok' : 'warn',
      done: status.agent.available,
    },
    {
      label: '网关检查',
      detail: status.agent.effectiveRuntime === 'openclaw'
        ? status.gateway.state === 'connected'
          ? `已连接 ${gatewayUrlLabel(status)}`
          : status.gateway.detail || '启动 OpenClaw Gateway 以获得流式响应'
        : status.agent.effectiveRuntime
          ? `${runtimeLabel(status.agent.effectiveRuntime)} 已配置；只有 OpenClaw 需要 Gateway`
          : '先选择一个代理运行时',
      tone: status.agent.effectiveRuntime && status.agent.effectiveRuntime !== 'openclaw'
        ? 'ok'
        : status.gateway.state === 'connected'
          ? 'ok'
          : 'warn',
      done: Boolean(status.agent.effectiveRuntime && status.agent.effectiveRuntime !== 'openclaw') || status.gateway.state === 'connected',
    },
    {
      label: '桌面自动化',
      detail: desktopControlReady
        ? 'Computer Use 后端可用'
        : desktopControlSetup
          ? `${desktopControlSetup} 需要配置`
          : '可选：启用 Hermes Computer Use 或 OpenClaw Peekaboo',
      tone: desktopControlReady ? 'ok' : 'warn',
      done: desktopControlReady,
    },
    {
      label: '飞书工作流',
      detail: larkCli?.health === 'ready'
        ? 'lark-cli 可用于飞书文档/消息动作'
        : '可选：配置 lark-cli 以写入飞书',
      tone: larkCli?.health === 'ready' ? 'ok' : 'warn',
      done: larkCli?.health === 'ready',
    },
    {
      label: '本地集成',
      detail: `${localTools.ready} 个可用，${localTools.needsSetup} 个待配置`,
      tone: localTools.ready > 0 ? 'ok' : 'warn',
      done: localTools.ready > 0,
    },
  ];
}

function welcomeCard(status: MiniStatus, localTools: LocalToolsSnapshot): string {
  const items = buildWelcomeChecklist(status, localTools);
  const blocking = items.filter((item) => !item.done && item.tone !== 'ok');
  const ctaLabel = blocking.length === 0 ? '完成' : '继续';
  const itemsHtml = items
    .map(
      (item) => `
        <li class="welcome-item ${item.done ? 'done' : item.tone}">
          <span class="status-dot ${item.tone}"></span>
          <div>
            <span class="welcome-label">${escapeHtml(item.label)}</span>
            <span class="welcome-detail">${escapeHtml(item.detail)}</span>
          </div>
        </li>
      `,
    )
    .join('');
  const demoItems = [
    {
      id: 'welcome-demo-dictate',
      title: '听写',
      copy: `${hotkeyLabel(status.hotkeys.hotkeyConfig)} 录音后把文字输入到当前光标位置。`,
      action: '试用听写',
    },
    {
      id: 'welcome-demo-command',
      title: '命令',
      copy: `${hotkeyLabel(status.hotkeys.hotkeyConfig)} + Shift 会把当前屏幕交给代理处理。`,
      action: '试用命令',
    },
    {
      id: 'welcome-demo-quickask',
      title: '快问',
      copy: `${hotkeyLabel(status.hotkeys.hotkeyConfig)} + Space 可在不切换应用的情况下提问。`,
      action: '试用快问',
    },
    {
      id: 'welcome-demo-refresh',
      title: '检查',
      copy: '重新检查麦克风、权限、运行时、Gateway 和本地集成。',
      action: '重新检查',
    },
  ];
  const demoHtml = demoItems
    .map((item) => `
      <button id="${item.id}" class="welcome-demo" type="button">
        <span class="welcome-demo-title">${escapeHtml(item.title)}</span>
        <span class="welcome-demo-copy">${escapeHtml(item.copy)}</span>
        <span class="welcome-demo-action">${escapeHtml(item.action)}</span>
      </button>
    `)
    .join('');
  return `
    <section class="welcome-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">欢迎</span>
          <h2>设置 Sarah</h2>
        </div>
        <span class="section-detail">首次运行</span>
      </div>
      <p class="section-copy">Sarah 是你的语音控制中心。完成下面的系统权限后，就可以在 macOS 任意位置听写、下命令或快速提问。</p>
      <ul class="welcome-list">${itemsHtml}</ul>
      <div class="welcome-demo-grid">${demoHtml}</div>
      <div class="welcome-actions">
        <button id="welcome-permissions" class="utility-action" type="button">打开系统设置</button>
        <button id="welcome-done" class="primary-action" type="button">${escapeHtml(ctaLabel)}</button>
      </div>
    </section>
  `;
}

function localIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function summaryCard(summaries: DailySummary[]): string {
  if (summaries.length === 0) return '';
  const today = localIsoDate();
  const sorted = [...summaries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted[0];
  const isToday = latest.date === today;
  const dateLabel = isToday ? 'Today' : latest.date;
  const turnLabel = `${latest.turnCount} turn${latest.turnCount === 1 ? '' : 's'}`;
  const truncated = latest.summary.length > 360
    ? `${latest.summary.slice(0, 360).trimEnd()}…`
    : latest.summary;
  return `
    <section class="summary-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Daily Memory</span>
          <h2>${escapeHtml(dateLabel)}</h2>
        </div>
        <span class="section-detail">${escapeHtml(turnLabel)}</span>
      </div>
      <p class="summary-body">${escapeHtml(truncated)}</p>
    </section>
  `;
}

function statusRow(label: string, value: string, detail: string, tone: string): string {
  return `
    <div class="status-row">
      <span class="status-dot ${tone}"></span>
      <div class="status-info">
        <span class="status-label">${escapeHtml(label)}</span>
        <span class="status-value">${escapeHtml(value)}</span>
      </div>
      <span class="status-detail">${escapeHtml(detail)}</span>
    </div>
  `;
}

function render(status: MiniStatus, localTools: LocalToolsSnapshot, summaries: DailySummary[]): void {
  lastRenderState = { status, localTools, summaries };
  const recorderReady = status.recorder.created && status.recorder.ready;
  const perms = status.permissions;
  const missingPerms = [
    perms.microphone !== 'granted' ? '麦克风' : null,
    !perms.accessibility ? '辅助功能' : null,
    !perms.inputMonitoring ? '输入监控' : null,
    perms.screenRecording !== 'granted' ? '屏幕录制' : null,
  ].filter(Boolean);
  const summary = healthSummary(status, missingPerms as string[], recorderReady);
  const hotkeyDisabled = status.hotkeys.currentVoiceState !== 'idle';

  root.innerHTML = `
    <div class="refresh-indicator" id="refresh-dot"></div>
    <section class="shell">
      <header class="header">
        <div class="header-left">
          <span class="brand-mark"></span>
          <div>
            <h1>Sarah</h1>
            <span class="header-subtitle">语音控制中心</span>
          </div>
        </div>
        <span class="mode-tag ${summary.tone}">${escapeHtml(summary.tone === 'ok' ? '正常' : summary.tone === 'warn' ? '注意' : '错误')}</span>
      </header>

      <div class="voice-hero">
        <span class="hero-orb ${voiceStateClass(status.hotkeys.currentVoiceState)}"></span>
        <div>
          <span class="voice-state-text">${escapeHtml(voiceStateLabel(status.hotkeys.currentVoiceState))}</span>
          <span class="voice-state-hint">${escapeHtml(hotkeyHint(status.hotkeys.hotkeyConfig))}</span>
        </div>
      </div>

      <div class="health-card ${summary.tone}">
        <span class="status-dot ${summary.tone}"></span>
        <div class="status-info">
          <span class="status-label">状态</span>
          <span class="status-value">${escapeHtml(summary.label)}</span>
          <span class="status-detail">${escapeHtml(summary.detail)}</span>
        </div>
      </div>

      ${renderNotice()}
      ${status.onboarding.showWelcome ? welcomeCard(status, localTools) : ''}
      ${summaryCard(summaries)}
      ${runtimeCard(status)}
      ${hotkeyPicker(status.hotkeys.hotkeyConfig, hotkeyDisabled)}
      ${localToolsCard(localTools)}

      <div class="action-grid">
        <button id="dictate" class="primary-action" type="button">听写</button>
        <button id="command" class="primary-action secondary" type="button">命令</button>
        <button id="quickask" class="primary-action secondary" type="button">快问</button>
        <button id="permissions" class="utility-action" type="button">打开权限设置</button>
        <button id="refresh" class="utility-action" type="button">刷新</button>
      </div>

      <div class="status-list">
        ${statusRow('网关', status.gateway.state, gatewayUrlLabel(status), gatewayStateClass(status.gateway.state))}
        ${statusRow('语音识别', status.asrProvider.name, status.asrProvider.configured ? '云端' : '本地', providerStateClass(status.asrProvider.configured))}
        ${statusRow('文本润色', status.refinementProvider.name, status.refinementProvider.configured ? '模型' : '降级', providerStateClass(status.refinementProvider.configured))}
      ${statusRow('代理', runtimeLabel(status.agent.effectiveRuntime), status.agent.available ? '可用' : '安装', status.agent.available ? 'ok' : 'error')}
        ${statusRow('录音器', recorderReady ? '就绪' : '加载中', status.recorder.asrStatus, recorderReady ? 'ok' : 'warn')}
      </div>

      <footer>
        <div class="footer-left">
          <button id="logs" type="button">日志</button>
        </div>
        <div class="footer-right">
          <button id="quit" type="button">退出</button>
        </div>
      </footer>
    </section>
  `;

  document.getElementById('dictate')?.addEventListener('click', () => {
    void window.api.mini.toggleDictation();
    setTimeout(() => void load(), 250);
  });
  document.getElementById('command')?.addEventListener('click', () => {
    void window.api.mini.toggleCommand();
    setTimeout(() => void load(), 250);
  });
  document.getElementById('quickask')?.addEventListener('click', () => {
    void window.api.mini.toggleQuickAsk();
    setTimeout(() => void load(), 250);
  });
  document.getElementById('permissions')?.addEventListener('click', () => {
    void window.api.mini.openPermissions();
  });
  document.getElementById('refresh')?.addEventListener('click', () => {
    void load();
  });
  document.getElementById('logs')?.addEventListener('click', () => {
    void window.api.mini.showLogs();
  });
  document.getElementById('quit')?.addEventListener('click', () => {
    void window.api.mini.quit();
  });

  document.getElementById('welcome-permissions')?.addEventListener('click', () => {
    void window.api.mini.openPermissions();
  });
  document.getElementById('welcome-done')?.addEventListener('click', () => {
    void completeWelcome();
  });
  document.getElementById('welcome-demo-dictate')?.addEventListener('click', () => {
    void window.api.mini.toggleDictation();
    setTimeout(() => void load(), 250);
  });
  document.getElementById('welcome-demo-command')?.addEventListener('click', () => {
    void window.api.mini.toggleCommand();
    setTimeout(() => void load(), 250);
  });
  document.getElementById('welcome-demo-quickask')?.addEventListener('click', () => {
    void window.api.mini.toggleQuickAsk();
    setTimeout(() => void load(), 250);
  });
  document.getElementById('welcome-demo-refresh')?.addEventListener('click', () => {
    void load();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-trigger-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.triggerKey as VoiceTriggerKey | undefined;
      if (!key || key === status.hotkeys.hotkeyConfig.voiceTriggerKey) return;
      void saveTriggerKey(status.hotkeys.hotkeyConfig, key);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-custom-trigger]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.customTrigger;
      if (action === 'capture') {
        startCustomKeyCapture(status.hotkeys.hotkeyConfig);
        return;
      }
      const input = document.getElementById('custom-keycode') as HTMLInputElement | null;
      const keycode = Number.parseInt(input?.value.trim() ?? '', 10);
      void saveCustomTriggerKey(status.hotkeys.hotkeyConfig, keycode);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-runtime-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const runtimeId = button.dataset.runtimeId as AgentRuntimeId | undefined;
      if (!runtimeId) return;
      void connectAgentRuntime(runtimeId);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-approval-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = button.dataset.approvalAction as 'approve' | 'revoke' | undefined;
      const toolId = button.dataset.toolId as LocalToolId | undefined;
      const capabilityId = button.dataset.capabilityId;
      if (!action || !toolId || !capabilityId) return;
      void changeApproval(action, toolId, capabilityId);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-execute-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const toolId = button.dataset.toolId as LocalToolId | undefined;
      const capabilityId = button.dataset.capabilityId;
      if (!toolId || !capabilityId) return;
      void executeLocalTool(toolId, capabilityId);
    });
  });
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <section class="shell">
      <header class="header">
        <div class="header-left">
          <h1>Sarah</h1>
          <span class="mode-tag">Error</span>
        </div>
      </header>
      <div class="error">${escapeHtml(message)}</div>
      <footer>
        <div class="footer-left"></div>
        <div class="footer-right">
          <button id="retry" type="button">Retry</button>
        </div>
      </footer>
    </section>
  `;
  document.getElementById('retry')?.addEventListener('click', () => {
    void load();
  });
}

async function load(): Promise<void> {
  const dot = document.getElementById('refresh-dot');
  dot?.classList.add('active');
  try {
    const [status, localTools, summariesResult] = await Promise.all([
      window.api.mini.getStatus(),
      window.api.localTools.getSnapshot(),
      window.api.agent.getDailySummaries().catch(() => [] as DailySummary[]),
    ]);
    render(status, localTools, summariesResult);
  } catch (error) {
    renderError(error);
  } finally {
    setTimeout(() => dot?.classList.remove('active'), 400);
  }
}

async function completeWelcome(): Promise<void> {
  notice = null;
  try {
    await window.api.mini.completeOnboarding();
    notice = { tone: 'ok', message: '设置完成。以后可以随时回来调整。' };
    await load();
  } catch (error) {
    notice = {
      tone: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    await load();
  }
}

async function changeApproval(
  action: 'approve' | 'revoke',
  toolId: LocalToolId,
  capabilityId: string,
): Promise<void> {
  notice = null;
  const scope: LocalToolApprovalScope = 'always';
  try {
    if (action === 'approve') {
      await window.api.localTools.setApproval(toolId, capabilityId, scope);
      notice = { tone: 'ok', message: `已批准 ${toolId}.${capabilityId}。` };
    } else {
      await window.api.localTools.revokeApproval(toolId, capabilityId);
      notice = { tone: 'ok', message: `已撤销 ${toolId}.${capabilityId}。` };
    }
    await load();
  } catch (error) {
    notice = {
      tone: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    await load();
  }
}

async function executeLocalTool(toolId: LocalToolId, capabilityId: string): Promise<void> {
  notice = null;
  try {
    const result = await window.api.localTools.execute({ toolId, capabilityId });
    notice = {
      tone: result.success ? 'ok' : result.requiresApproval ? 'warn' : 'error',
      message: result.output ?? result.error ?? `${toolId}.${capabilityId} finished.`,
    };
    await load();
  } catch (error) {
    notice = {
      tone: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    await load();
  }
}

async function saveTriggerKey(currentConfig: HotkeyConfig, key: VoiceTriggerKey): Promise<void> {
  notice = null;
  try {
    const nextConfig: HotkeyConfig = {
      ...currentConfig,
      voiceTriggerKey: key,
      customKeycode: key === 'custom' ? currentConfig.customKeycode : undefined,
    };
    const check = await window.api.clawDesk.checkVoiceTrigger(nextConfig);
    if (!check.isValid) {
      notice = { tone: 'error', message: conflictMessage(check) || '快捷键与已有设置冲突。' };
      await load();
      return;
    }
    const result = await window.api.clawDesk.saveHotkeyConfig({
      ...nextConfig,
    });
    if (!result.success) {
      notice = { tone: 'error', message: result.error ?? '应用快捷键失败。' };
      await load();
      return;
    }
    notice = { tone: 'ok', message: `触发键已改为 ${VOICE_TRIGGER_KEY_LABELS[key]}。` };
    await load();
  } catch (error) {
    notice = {
      tone: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    await load();
  }
}

function startCustomKeyCapture(currentConfig: HotkeyConfig): void {
  customCaptureActive = true;
  notice = { tone: 'warn', message: '按下要作为 Sarah 主触发键的按键。普通字母/数字会被拦截。' };
  if (lastRenderState) {
    render(lastRenderState.status, lastRenderState.localTools, lastRenderState.summaries);
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    customCaptureActive = false;
    const keycode = DOM_CODE_TO_UIOHOOK.get(event.code);
    if (!keycode) {
      notice = {
        tone: 'error',
        message: `暂时不能识别 ${formatKeyEvent(event)}。请填写 uiohook keycode，或使用右侧修饰键/F18/F19。`,
      };
      void load();
      return;
    }
    void saveCustomTriggerKey(currentConfig, keycode);
  };

  window.addEventListener('keydown', onKeyDown, { capture: true, once: true });
}

async function saveCustomTriggerKey(currentConfig: HotkeyConfig, keycode: number): Promise<void> {
  notice = null;
  if (!Number.isInteger(keycode) || keycode <= 0) {
    notice = { tone: 'error', message: '请输入有效的 uiohook keycode。' };
    await load();
    return;
  }

  const nextConfig: HotkeyConfig = {
    ...currentConfig,
    voiceTriggerKey: 'custom',
    customKeycode: keycode,
  };

  try {
    const check = await window.api.clawDesk.checkVoiceTrigger(nextConfig);
    if (!check.isValid) {
      notice = { tone: 'error', message: conflictMessage(check) || '快捷键与已有设置冲突。' };
      await load();
      return;
    }
    const result = await window.api.clawDesk.saveHotkeyConfig(nextConfig);
    if (!result.success) {
      notice = { tone: 'error', message: result.error ?? '应用快捷键失败。' };
      await load();
      return;
    }
    notice = { tone: 'ok', message: `触发键已改为自定义 keycode ${keycode}。` };
    await load();
  } catch (error) {
    notice = {
      tone: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    await load();
  }
}

async function connectAgentRuntime(runtimeId: AgentRuntimeId): Promise<void> {
  notice = null;
  try {
    const result = await window.api.clawDesk.connectAgentRuntime(runtimeId);
    const selection = result.selection;
    const runtime = selection.runtimes.find((item) => item.id === runtimeId);
    notice = {
      tone: result.success ? 'ok' : 'warn',
      message: result.detail || `${runtime?.name ?? runtimeId} 已选择${runtime?.ready ? '。' : '，使用命令/快问前还需要完成配置。'}`,
    };
    await load();
  } catch (error) {
    notice = {
      tone: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    await load();
  }
}

// Initial load
void load();

// Auto-refresh on window focus
window.addEventListener('focus', () => {
  void load();
});

// Auto-refresh every 10 seconds
setInterval(() => {
  void load();
}, 10_000);
