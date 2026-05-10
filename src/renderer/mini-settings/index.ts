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
  type VoiceTriggerKey,
} from '../../shared/types/clawdesk-settings';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Mini settings root element not found');
}

const root = rootElement;
let notice: { tone: 'ok' | 'warn' | 'error'; message: string } | null = null;

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
    ? `Key ${config.customKeycode ?? '?'}`
    : (VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey);
  return `Dictate ${label} · Command ${label} + Shift · Ask ${label} + Space`;
}

function hotkeyLabel(config: HotkeyConfig): string {
  return config.voiceTriggerKey === 'custom'
    ? `Key ${config.customKeycode ?? '?'}`
    : (VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey);
}

function shortcutDeck(config: HotkeyConfig): string {
  const label = hotkeyLabel(config);
  return `
    <div class="shortcut-deck" aria-label="Shortcut modes">
      <div class="shortcut-token active">
        <span>Dictate</span>
        <kbd>${escapeHtml(label)}</kbd>
      </div>
      <div class="shortcut-token">
        <span>Command</span>
        <kbd>${escapeHtml(label)} + Shift</kbd>
      </div>
      <div class="shortcut-token">
        <span>Ask</span>
        <kbd>${escapeHtml(label)} + Space</kbd>
      </div>
    </div>
  `;
}

function renderNotice(): string {
  if (!notice) return '';
  return `<div class="notice ${notice.tone}">${escapeHtml(notice.message)}</div>`;
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
    ? `Custom keycode ${config.customKeycode ?? '?'}`
    : VOICE_TRIGGER_KEY_LABELS[config.voiceTriggerKey];
  const disabledCopy = disabled
    ? 'Stop the current recording before changing shortcuts.'
    : 'Choose one stable base trigger. Advanced keycodes stay hidden for release builds.';

  return `
    <section class="hotkey-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Hotkeys</span>
          <h2>${escapeHtml(currentLabel)}</h2>
        </div>
        <span class="section-detail">${escapeHtml(disabled ? 'Recording' : 'Live')}</span>
      </div>
      <p class="section-copy">${escapeHtml(disabledCopy)}</p>
      ${shortcutDeck(config)}
      <div class="trigger-grid">${buttons}</div>
    </section>
  `;
}

function runtimeTone(runtime: AgentRuntimeStatus): 'ok' | 'warn' | 'error' {
  if (runtime.ready) return 'ok';
  return runtime.installed ? 'warn' : 'error';
}

function runtimeCard(status: MiniStatus): string {
  const buttons = status.agent.runtimes.map((runtime) => {
    const selected = status.agent.effectiveRuntime === runtime.id;
    const tone = runtimeTone(runtime);
    const state = runtime.ready ? 'Ready' : runtime.installed ? 'Setup' : 'Missing';
    const action = selected && runtime.ready ? 'Using' : runtime.ready ? 'Use' : runtime.installed ? 'Setup' : 'Install';
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
          <span class="runtime-detail">${escapeHtml(runtime.path ? runtime.path.replace(/^\/Users\/[^/]+/, '~') : runtime.setupHint ?? runtime.detail ?? 'Not configured')}</span>
          <span class="runtime-action">${escapeHtml(action)}</span>
        </span>
      </button>
    `;
  }).join('');
  const active = status.agent.runtimes.find((runtime) => runtime.id === status.agent.effectiveRuntime);
  const detail = active?.ready
    ? `${active.name} will answer Command and Quick Ask.`
    : 'Pick an installed runtime, then finish its setup if needed.';

  return `
    <section class="runtime-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Agent Runtime</span>
          <h2>${escapeHtml(active?.name ?? 'Choose runtime')}</h2>
        </div>
        <span class="section-detail ${active?.ready ? 'ok' : 'warn'}">${escapeHtml(status.agent.selectedRuntime ? 'Manual' : 'Auto')}</span>
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
  const action = !consent
    ? ''
    : approved
      ? `<button class="chip-action revoke" data-approval-action="revoke" ${dataset} type="button">Revoke</button>`
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
    <section class="local-tools-card">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Local Tools</span>
          <h2>${snapshot.ready} ready · ${snapshot.needsSetup} setup</h2>
        </div>
        <span class="section-detail ${tone}">${snapshot.tools.length} tools</span>
      </div>
      <p class="section-copy">Sarah detects local capabilities here. Write, message, and external actions require explicit approval.</p>
      <div class="tool-list">
        ${snapshot.tools.map(renderLocalTool).join('')}
      </div>
    </section>
  `;
}

function voiceStateLabel(state: string): string {
  switch (state) {
    case 'idle':
      return 'Idle';
    case 'dictation_recording':
      return 'Dictating...';
    case 'command_recording':
      return 'Command mode...';
    case 'quickask_recording':
      return 'Quick Ask...';
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
  return (status.gateway.url || status.gateway.detail || 'Gateway unavailable').replace(/^https?:\/\//, '');
}

function providerStateClass(configured: boolean): string {
  return configured ? 'ok' : 'warn';
}

function healthSummary(status: MiniStatus, missingPerms: string[], recorderReady: boolean): { tone: string; label: string; detail: string } {
  if (missingPerms.length > 0) {
    return {
      tone: 'warn',
      label: `${missingPerms.length} permission${missingPerms.length === 1 ? '' : 's'} need attention`,
      detail: missingPerms.join(', '),
    };
  }
  if (!status.agent.available) {
    return {
      tone: 'error',
      label: 'Agent unavailable',
      detail: 'Connect Hermes or OpenClaw before using Command / Quick Ask',
    };
  }
  if (!recorderReady) {
    return {
      tone: 'warn',
      label: 'Recorder warming up',
      detail: status.recorder.asrStatus,
    };
  }
  return {
    tone: 'ok',
    label: 'Ready for voice',
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
  return [
    {
      label: 'Microphone access',
      detail: perms.microphone === 'granted' ? 'Granted' : 'Allow Sarah to use your microphone',
      tone: perms.microphone === 'granted' ? 'ok' : 'warn',
      done: perms.microphone === 'granted',
    },
    {
      label: 'Accessibility',
      detail: perms.accessibility ? 'Granted' : 'Required for hold-to-talk shortcuts',
      tone: perms.accessibility ? 'ok' : 'warn',
      done: perms.accessibility,
    },
    {
      label: 'Input Monitoring',
      detail: perms.inputMonitoring ? 'Granted' : 'Required to capture trigger keys',
      tone: perms.inputMonitoring ? 'ok' : 'warn',
      done: perms.inputMonitoring,
    },
    {
      label: 'Speech provider',
      detail: status.asrProvider.configured
        ? `${status.asrProvider.name} configured`
        : 'Apple Speech fallback (works offline)',
      tone: 'ok',
      done: true,
    },
    {
      label: 'Agent runtime',
      detail: status.agent.available
        ? `${status.agent.effectiveRuntime === 'hermes' ? 'Hermes' : 'OpenClaw'} ready for Command and Quick Ask`
        : 'Connect Hermes or OpenClaw for Command and Quick Ask',
      tone: status.agent.available ? 'ok' : 'warn',
      done: status.agent.available,
    },
    {
      label: 'Gateway check',
      detail: status.agent.effectiveRuntime === 'openclaw'
        ? status.gateway.state === 'connected'
          ? `Connected at ${gatewayUrlLabel(status)}`
          : status.gateway.detail || 'Start OpenClaw Gateway for streaming responses'
        : status.agent.effectiveRuntime === 'hermes'
          ? 'Hermes is configured; Sarah uses CLI fallback until Hermes exposes a local streaming agent API'
          : 'Choose a runtime before checking Gateway streaming',
      tone: status.agent.effectiveRuntime === 'hermes'
        ? 'ok'
        : status.gateway.state === 'connected'
          ? 'ok'
          : 'warn',
      done: status.agent.effectiveRuntime === 'hermes' || status.gateway.state === 'connected',
    },
    {
      label: 'Local tools',
      detail: `${localTools.ready} ready, ${localTools.needsSetup} need setup`,
      tone: localTools.ready > 0 ? 'ok' : 'warn',
      done: localTools.ready > 0,
    },
  ];
}

function welcomeCard(status: MiniStatus, localTools: LocalToolsSnapshot): string {
  const items = buildWelcomeChecklist(status, localTools);
  const blocking = items.filter((item) => !item.done && item.tone !== 'ok');
  const ctaLabel = blocking.length === 0 ? "I'm ready" : 'Continue anyway';
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
      title: 'Dictate',
      copy: `${hotkeyLabel(status.hotkeys.hotkeyConfig)} records text and inserts it into the focused app.`,
      action: 'Try Dictate',
    },
    {
      id: 'welcome-demo-command',
      title: 'Command',
      copy: `${hotkeyLabel(status.hotkeys.hotkeyConfig)} + Shift sends the current screen to the agent.`,
      action: 'Try Command',
    },
    {
      id: 'welcome-demo-refresh',
      title: 'Verify',
      copy: 'Refresh reruns microphone, permission, runtime, Gateway, and local tool checks.',
      action: 'Run Checks',
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
          <span class="section-kicker">Welcome</span>
          <h2>Set up Sarah</h2>
        </div>
        <span class="section-detail">First run</span>
      </div>
      <p class="section-copy">Sarah is your voice control center. Grant the system permissions below, then you can dictate, command, or ask anywhere on macOS.</p>
      <ul class="welcome-list">${itemsHtml}</ul>
      <div class="welcome-demo-grid">${demoHtml}</div>
      <div class="welcome-actions">
        <button id="welcome-permissions" class="utility-action" type="button">Open System Settings</button>
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
  const recorderReady = status.recorder.created && status.recorder.ready;
  const perms = status.permissions;
  const missingPerms = [
    perms.microphone !== 'granted' ? 'Mic' : null,
    !perms.accessibility ? 'A11y' : null,
    !perms.inputMonitoring ? 'Input' : null,
    perms.screenRecording !== 'granted' ? 'Screen' : null,
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
            <span class="header-subtitle">Voice Control Center</span>
          </div>
        </div>
        <span class="mode-tag ${summary.tone}">${escapeHtml(summary.tone)}</span>
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
          <span class="status-label">Health</span>
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
        <button id="dictate" class="primary-action" type="button">Dictate</button>
        <button id="command" class="primary-action secondary" type="button">Command</button>
        <button id="permissions" class="utility-action" type="button">Fix Permissions</button>
        <button id="refresh" class="utility-action" type="button">Refresh</button>
      </div>

      <div class="status-list">
        ${statusRow('Gateway', status.gateway.state, gatewayUrlLabel(status), gatewayStateClass(status.gateway.state))}
        ${statusRow('Speech', status.asrProvider.name, status.asrProvider.configured ? 'Cloud' : 'Local', providerStateClass(status.asrProvider.configured))}
        ${statusRow('Refinement', status.refinementProvider.name, status.refinementProvider.configured ? 'Model' : 'Fallback', providerStateClass(status.refinementProvider.configured))}
        ${statusRow('Agent', status.agent.effectiveRuntime ? (status.agent.effectiveRuntime === 'hermes' ? 'Hermes' : 'OpenClaw') : 'Not found', status.agent.available ? 'Ready' : 'Install', status.agent.available ? 'ok' : 'error')}
        ${statusRow('Recorder', recorderReady ? 'Ready' : 'Loading', status.recorder.asrStatus, recorderReady ? 'ok' : 'warn')}
      </div>

      <footer>
        <div class="footer-left">
          <button id="logs" type="button">Logs</button>
        </div>
        <div class="footer-right">
          <button id="quit" type="button">Quit</button>
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

  document.querySelectorAll<HTMLButtonElement>('[data-runtime-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const runtimeId = button.dataset.runtimeId as AgentRuntimeId | undefined;
      if (!runtimeId) return;
      void connectAgentRuntime(runtimeId);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-approval-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.approvalAction as 'approve' | 'revoke' | undefined;
      const toolId = button.dataset.toolId as LocalToolId | undefined;
      const capabilityId = button.dataset.capabilityId;
      if (!action || !toolId || !capabilityId) return;
      void changeApproval(action, toolId, capabilityId);
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
    notice = { tone: 'ok', message: 'Welcome aboard. You can revisit setup any time.' };
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
      notice = { tone: 'ok', message: `Approved ${capabilityId} for ${toolId}.` };
    } else {
      await window.api.localTools.revokeApproval(toolId, capabilityId);
      notice = { tone: 'ok', message: `Revoked ${capabilityId} for ${toolId}.` };
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

async function saveTriggerKey(currentConfig: HotkeyConfig, key: VoiceTriggerKey): Promise<void> {
  notice = null;
  try {
    const result = await window.api.clawDesk.saveHotkeyConfig({
      ...currentConfig,
      voiceTriggerKey: key,
      customKeycode: key === 'custom' ? currentConfig.customKeycode : undefined,
    });
    if (!result.success) {
      notice = { tone: 'error', message: result.error ?? 'Failed to apply shortcut.' };
      await load();
      return;
    }
    notice = { tone: 'ok', message: `Trigger key changed to ${VOICE_TRIGGER_KEY_LABELS[key]}.` };
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
      message: result.detail || `${runtime?.name ?? runtimeId} selected${runtime?.ready ? '.' : '. Finish setup before using Command / Quick Ask.'}`,
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
