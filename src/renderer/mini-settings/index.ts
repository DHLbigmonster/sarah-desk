import type { MiniStatus } from '../../shared/types/mini';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Mini settings root element not found');
}

const root = rootElement;

function statusText(value: boolean): string {
  return value ? 'Ready' : 'Needs attention';
}

function statusClass(value: boolean): string {
  return value ? 'ok' : 'warn';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render(status: MiniStatus): void {
  const recorderReady = status.recorder.created && status.recorder.ready;
  root.innerHTML = `
    <section class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">Sarah</p>
          <h1>Control Center</h1>
        </div>
        <span class="mode">Voice</span>
      </header>

      <div class="hero">
        <div>
          <span class="label">Voice Runtime</span>
          <strong>${escapeHtml(status.hotkeys.currentVoiceState)}</strong>
          <small>Right Ctrl for dictation, Ctrl+Space for quick ask</small>
        </div>
        <span class="signal ${status.hotkeys.keyboardHookActive ? 'ok' : 'warn'}">
          ${status.hotkeys.keyboardHookActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div class="panel" aria-label="Runtime status">
        <div class="row">
          <div>
            <span class="label">Gateway</span>
            <strong>${escapeHtml(status.gateway.url)}</strong>
            <small>${escapeHtml(status.gateway.detail)}</small>
          </div>
          <span class="pill ${status.gateway.state === 'connected' ? 'ok' : 'warn'}">
            ${status.gateway.state}
          </span>
        </div>

        <div class="row">
          <div>
            <span class="label">Speech</span>
            <strong>${escapeHtml(status.asrProvider.name)}</strong>
            <small>${escapeHtml(status.asrProvider.detail)}</small>
          </div>
          <span class="pill ${statusClass(status.asrProvider.configured)}">
            ${statusText(status.asrProvider.configured)}
          </span>
        </div>

        <div class="row">
          <div>
            <span class="label">Refinement</span>
            <strong>${escapeHtml(status.refinementProvider.name)}</strong>
            <small>${escapeHtml(status.refinementProvider.detail)}</small>
          </div>
          <span class="pill ${statusClass(status.refinementProvider.configured)}">
            ${status.refinementProvider.configured ? 'Model' : 'Fallback'}
          </span>
        </div>

        <div class="row">
          <div>
            <span class="label">Recorder</span>
            <strong>Hidden recorder window</strong>
            <small>ASR status: ${escapeHtml(status.recorder.asrStatus)}</small>
          </div>
          <span class="pill ${statusClass(recorderReady)}">
            ${recorderReady ? 'Ready' : 'Loading'}
          </span>
        </div>
      </div>

      <footer>
        <button id="logs" type="button">Logs</button>
        <button id="refresh" type="button" class="primary">Refresh</button>
      </footer>
    </section>
  `;

  document.getElementById('refresh')?.addEventListener('click', () => {
    void load();
  });
  document.getElementById('logs')?.addEventListener('click', () => {
    void window.api.mini.showLogs();
  });
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <section class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">Sarah</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div class="error">${escapeHtml(message)}</div>
      <footer><button id="refresh" type="button">Refresh</button></footer>
    </section>
  `;
  document.getElementById('refresh')?.addEventListener('click', () => {
    void load();
  });
}

async function load(): Promise<void> {
  try {
    render(await window.api.mini.getStatus());
  } catch (error) {
    renderError(error);
  }
}

void load();
