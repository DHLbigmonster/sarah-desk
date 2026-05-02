import type { MiniStatus } from '../../shared/types/mini';
import type { LocalToolHealth, LocalToolsSnapshot, LocalToolStatus } from '../../shared/types/local-tools';
import {
  SAFE_TRIGGER_KEYS,
  VOICE_TRIGGER_KEY_LABELS,
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

function escapeHtml(value: string): string {
  return value
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

function renderCapabilities(tool: LocalToolStatus): string {
  const enabled = tool.capabilities.filter((capability) => capability.enabled);
  if (enabled.length === 0) {
    return '<span class="tool-chip muted">No enabled actions</span>';
  }
  return enabled
    .slice(0, 3)
    .map((capability) => `
      <span class="tool-chip ${capability.requiresConsent ? 'consent' : ''}">
        ${escapeHtml(capability.label)}${capability.requiresConsent ? ' · approve' : ''}
      </span>
    `)
    .join('');
}

function renderLocalTool(tool: LocalToolStatus): string {
  const tone = localToolTone(tool.health);
  const pathLabel = tool.path ? tool.path.replace(/^\/Users\/[^/]+/, '~') : (tool.setupHint ?? 'Not configured');
  return `
    <div class="tool-row">
      <span class="status-dot ${tone}"></span>
      <div class="tool-body">
        <div class="tool-main">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-state ${tone}">${escapeHtml(tool.health.replace('_', ' '))}</span>
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
      detail: 'OpenClaw is not installed or not on PATH',
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

function render(status: MiniStatus, localTools: LocalToolsSnapshot): void {
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
      ${hotkeyPicker(status.hotkeys.hotkeyConfig, hotkeyDisabled)}
      ${localToolsCard(localTools)}

      <div class="action-grid">
        <button id="dictate" class="primary-action" type="button">Dictate</button>
        <button id="command" class="primary-action secondary" type="button">Command</button>
        <button id="permissions" class="utility-action" type="button">Fix Permissions</button>
        <button id="refresh" class="utility-action" type="button">Refresh</button>
      </div>

      <div class="status-list">
        ${statusRow('Gateway', status.gateway.state, status.gateway.url.replace(/^https?:\/\//, ''), gatewayStateClass(status.gateway.state))}
        ${statusRow('Speech', status.asrProvider.name, status.asrProvider.configured ? 'Cloud' : 'Local', providerStateClass(status.asrProvider.configured))}
        ${statusRow('Refinement', status.refinementProvider.name, status.refinementProvider.configured ? 'Model' : 'Fallback', providerStateClass(status.refinementProvider.configured))}
        ${statusRow('Agent', status.agent.available ? 'OpenClaw' : 'Not found', status.agent.available ? 'Ready' : 'Install', status.agent.available ? 'ok' : 'error')}
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

  document.querySelectorAll<HTMLButtonElement>('[data-trigger-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.triggerKey as VoiceTriggerKey | undefined;
      if (!key || key === status.hotkeys.hotkeyConfig.voiceTriggerKey) return;
      void saveTriggerKey(status.hotkeys.hotkeyConfig, key);
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
    const [status, localTools] = await Promise.all([
      window.api.mini.getStatus(),
      window.api.localTools.getSnapshot(),
    ]);
    render(status, localTools);
  } catch (error) {
    renderError(error);
  } finally {
    setTimeout(() => dot?.classList.remove('active'), 400);
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
