import type { MiniStatus } from '../../shared/types/mini';
import type { HotkeyConfig } from '../../shared/types/clawdesk-settings';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Mini settings root element not found');
}

const root = rootElement;


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TRIGGER_KEY_LABELS: Record<string, string> = {
  CtrlRight: 'Right Ctrl',
  AltRight: 'Right Alt',
  CapsLock: 'CapsLock',
  MetaRight: 'Right Cmd',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
};

function hotkeyHint(config: HotkeyConfig): string {
  const label = config.voiceTriggerKey === 'custom'
    ? `Key ${config.customKeycode ?? '?'}`
    : (TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey);
  return `${label} · ${label}+Space`;
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

function render(status: MiniStatus): void {
  const recorderReady = status.recorder.created && status.recorder.ready;
  const perms = status.permissions;
  const missingPerms = [
    perms.microphone !== 'granted' ? 'Mic' : null,
    !perms.accessibility ? 'A11y' : null,
    !perms.inputMonitoring ? 'Input' : null,
    perms.screenRecording !== 'granted' ? 'Screen' : null,
  ].filter(Boolean);

  root.innerHTML = `
    <div class="refresh-indicator" id="refresh-dot"></div>
    <section class="shell">
      <header class="header">
        <div class="header-left">
          <h1>Sarah</h1>
          <span class="mode-tag">Voice</span>
        </div>
      </header>

      <div class="voice-hero">
        <span class="status-dot ${voiceStateClass(status.hotkeys.currentVoiceState)}"></span>
        <div>
          <span class="voice-state-text">${escapeHtml(voiceStateLabel(status.hotkeys.currentVoiceState))}</span>
          <span class="voice-state-hint">${escapeHtml(hotkeyHint(status.hotkeys.hotkeyConfig))}</span>
        </div>
      </div>

      ${missingPerms.length > 0 ? `
      <div class="status-card warn-card">
        <span class="status-dot warn"></span>
        <div class="status-info">
          <span class="status-label">Permissions</span>
          <span class="status-value">Missing: ${escapeHtml(missingPerms.join(', '))}</span>
          <span class="status-detail">Open Settings to grant</span>
        </div>
      </div>
      ` : ''}

      <div class="status-grid">
        <div class="status-card">
          <span class="status-dot ${gatewayStateClass(status.gateway.state)}"></span>
          <div class="status-info">
            <span class="status-label">Gateway</span>
            <span class="status-value">${escapeHtml(status.gateway.state)}</span>
            <span class="status-detail">${escapeHtml(status.gateway.url)}</span>
          </div>
        </div>

        <div class="status-card">
          <span class="status-dot ${status.asrProvider.configured ? 'ok' : 'warn'}"></span>
          <div class="status-info">
            <span class="status-label">Speech</span>
            <span class="status-value">${escapeHtml(status.asrProvider.name)}</span>
            <span class="status-detail">${escapeHtml(status.asrProvider.detail)}</span>
          </div>
        </div>

        <div class="status-card">
          <span class="status-dot ${status.refinementProvider.configured ? 'ok' : 'warn'}"></span>
          <div class="status-info">
            <span class="status-label">Refinement</span>
            <span class="status-value">${escapeHtml(status.refinementProvider.name)}</span>
            <span class="status-detail">${status.refinementProvider.configured ? 'Model' : 'Fallback'}</span>
          </div>
        </div>

        <div class="status-card">
          <span class="status-dot ${status.agent.available ? 'ok' : 'error'}"></span>
          <div class="status-info">
            <span class="status-label">Agent</span>
            <span class="status-value">${status.agent.available ? 'OpenClaw' : 'Not found'}</span>
            <span class="status-detail">${escapeHtml(status.agent.detail)}</span>
          </div>
        </div>

        <div class="status-card">
          <span class="status-dot ${recorderReady ? 'ok' : 'warn'}"></span>
          <div class="status-info">
            <span class="status-label">Recorder</span>
            <span class="status-value">${recorderReady ? 'Ready' : 'Loading'}</span>
            <span class="status-detail">${escapeHtml(status.recorder.asrStatus)}</span>
          </div>
        </div>
      </div>

      <footer>
        <div class="footer-left">
          <button id="logs" type="button">Logs</button>
        </div>
        <div class="footer-right">
        </div>
      </footer>
    </section>
  `;

  document.getElementById('logs')?.addEventListener('click', () => {
    void window.api.mini.showLogs();
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
    render(await window.api.mini.getStatus());
  } catch (error) {
    renderError(error);
  } finally {
    setTimeout(() => dot?.classList.remove('active'), 400);
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
