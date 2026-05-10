import '@fontsource-variable/geist';
import Activity from 'lucide-react/dist/esm/icons/activity.mjs';
import AudioLines from 'lucide-react/dist/esm/icons/audio-lines.mjs';
import Bot from 'lucide-react/dist/esm/icons/bot.mjs';
import Check from 'lucide-react/dist/esm/icons/check.mjs';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import Command from 'lucide-react/dist/esm/icons/command.mjs';
import FileText from 'lucide-react/dist/esm/icons/file-text.mjs';
import Mic from 'lucide-react/dist/esm/icons/mic.mjs';
import Power from 'lucide-react/dist/esm/icons/power.mjs';
import Settings from 'lucide-react/dist/esm/icons/settings.mjs';
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert.mjs';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.mjs';
import SquareTerminal from 'lucide-react/dist/esm/icons/square-terminal.mjs';
import X from 'lucide-react/dist/esm/icons/x.mjs';
import { StrictMode, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { HotkeyConfig } from '../../shared/types/clawdesk-settings';
import type { MiniStatus } from '../../shared/types/mini';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Menubar popover root element not found');
}

const TRIGGER_KEY_LABELS: Record<string, string> = {
  CtrlRight: 'Right Ctrl',
  AltRight: 'Right Option',
  CapsLock: 'Caps Lock',
  MetaRight: 'Right Cmd',
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
  F18: 'F18',
  F19: 'F19',
};

type Tone = 'ok' | 'warn' | 'error' | 'neutral';

interface StatusRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

function hotkeyLabel(config: HotkeyConfig): string {
  if (config.voiceTriggerKey === 'custom') {
    return `Key ${config.customKeycode ?? '?'}`;
  }
  return TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey;
}

function voiceStateText(state: MiniStatus['hotkeys']['currentVoiceState']): string {
  switch (state) {
    case 'dictation_recording':
      return 'Dictating';
    case 'command_recording':
      return 'Command';
    case 'quickask_recording':
      return 'Quick Ask';
    default:
      return 'Ready';
  }
}

function gatewayTone(state: MiniStatus['gateway']['state']): Tone {
  if (state === 'connected') return 'ok';
  if (state === 'loading') return 'warn';
  return 'error';
}

function providerTone(configured: boolean): Tone {
  return configured ? 'ok' : 'warn';
}

function providerDetail(configured: boolean, detail: string, fallback: string): string {
  if (detail) return detail;
  return configured ? 'Configured' : fallback;
}

function permissionIssues(status: MiniStatus): string[] {
  return [
    status.permissions.microphone !== 'granted' ? 'Mic' : null,
    !status.permissions.accessibility ? 'A11y' : null,
    !status.permissions.inputMonitoring ? 'Input' : null,
    status.permissions.screenRecording !== 'granted' ? 'Screen' : null,
  ].filter((item): item is string => Boolean(item));
}

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }): ReactNode {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

function StatusRow({ icon, label, value, detail, tone }: StatusRowProps): ReactNode {
  return (
    <div className="status-row">
      <div className={`status-row__icon status-row__icon--${tone}`}>{icon}</div>
      <div className="status-row__body">
        <span className="status-row__label">{label}</span>
        <span className="status-row__value">{value}</span>
      </div>
      <span className="status-row__detail">{detail}</span>
    </div>
  );
}

function App(): ReactNode {
  const [status, setStatus] = useState<MiniStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await window.api.mini.getStatus());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      window.setTimeout(() => setRefreshing(false), 180);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    const onFocus = (): void => { void load(); };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void window.api.mini.hidePopover();
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [load]);

  const issues = useMemo(() => status ? permissionIssues(status) : [], [status]);
  const triggerLabel = status ? hotkeyLabel(status.hotkeys.hotkeyConfig) : 'Loading';
  const voiceTone: Tone = status?.hotkeys.currentVoiceState === 'idle' ? 'ok' : 'warn';
  const recorderReady = status ? status.recorder.created && status.recorder.ready : false;

  return (
    <main className="popover">
      <div className="popover__arrow" />
      <header className="titlebar">
        <div>
          <div className="titlebar__brand">
            <AudioLines size={17} strokeWidth={2.2} />
            <h1>Sarah</h1>
          </div>
          <p>{status ? voiceStateText(status.hotkeys.currentVoiceState) : 'Loading runtime'}</p>
        </div>
        <div className="titlebar__actions">
          <button className="icon-button" type="button" title="Settings" aria-label="Settings" onClick={() => void window.api.mini.showSettings()}>
            <Settings size={16} />
          </button>
          <button className="icon-button" type="button" title="Close" aria-label="Close" onClick={() => void window.api.mini.hidePopover()}>
            <X size={16} />
          </button>
        </div>
      </header>

      {error ? (
        <section className="error-panel">
          <ShieldAlert size={18} />
          <div>
            <strong>Status unavailable</strong>
            <span>{error}</span>
          </div>
        </section>
      ) : null}

      <section className="hero-band">
        <div className="hero-band__status">
          <span className={`live-dot live-dot--${voiceTone}`} />
          <span>{status ? voiceStateText(status.hotkeys.currentVoiceState) : 'Checking'}</span>
        </div>
        <div className="hero-band__hint">
          <kbd>{triggerLabel}</kbd>
          <span>press to dictate</span>
        </div>
      </section>

      <section className="quick-actions" aria-label="Voice actions">
        <button className="primary-action" type="button" onClick={() => void window.api.mini.toggleDictation()}>
          <Mic size={18} />
          <span>Dictate</span>
        </button>
        <button className="primary-action primary-action--secondary" type="button" onClick={() => void window.api.mini.toggleCommand()}>
          <Command size={18} />
          <span>Command</span>
        </button>
      </section>

      <section className="permission-strip">
        <div>
          <ShieldAlert size={15} />
          <span>{issues.length === 0 ? 'Permissions ready' : `Missing ${issues.join(', ')}`}</span>
        </div>
        {issues.length === 0 ? (
          <StatusPill tone="ok"><Check size={12} /> OK</StatusPill>
        ) : (
          <button className="text-button" type="button" onClick={() => void window.api.mini.openPermissions()}>
            Fix <ChevronRight size={13} />
          </button>
        )}
      </section>

      <section className="status-list" aria-label="Runtime status">
        {status ? (
          <>
            <StatusRow
              icon={<Activity size={16} />}
              label="Gateway"
              value={status.gateway.state}
              detail={status.gateway.url.replace(/^https?:\/\//, '')}
              tone={gatewayTone(status.gateway.state)}
            />
            <StatusRow
              icon={<Mic size={16} />}
              label="Speech"
              value={status.asrProvider.name}
              detail={providerDetail(status.asrProvider.configured, status.asrProvider.detail, 'Local')}
              tone={providerTone(status.asrProvider.configured)}
            />
            <StatusRow
              icon={<Sparkles size={16} />}
              label="Refinement"
              value={status.refinementProvider.name}
              detail={providerDetail(status.refinementProvider.configured, status.refinementProvider.detail, 'Fallback')}
              tone={providerTone(status.refinementProvider.configured)}
            />
            <StatusRow
              icon={<Bot size={16} />}
              label="Agent"
              value={status.agent.effectiveRuntime === 'hermes' ? 'Hermes' : status.agent.effectiveRuntime === 'openclaw' ? 'OpenClaw' : 'Not found'}
              detail={status.agent.available ? 'Ready' : 'Install'}
              tone={status.agent.available ? 'ok' : 'error'}
            />
            <StatusRow
              icon={<AudioLines size={16} />}
              label="Recorder"
              value={recorderReady ? 'Ready' : 'Starting'}
              detail={status.recorder.asrStatus}
              tone={recorderReady ? 'ok' : 'warn'}
            />
          </>
        ) : (
          <div className="status-list__loading">Loading status…</div>
        )}
      </section>

      <footer className="footer">
        <button type="button" className="footer-button" onClick={() => void window.api.mini.showLogs()}>
          <FileText size={15} /> Logs
        </button>
        <button type="button" className="footer-button" onClick={() => void load()}>
          <SquareTerminal size={15} /> {refreshing ? 'Checking' : 'Refresh'}
        </button>
        <button type="button" className="footer-button footer-button--danger" onClick={() => void window.api.mini.quit()}>
          <Power size={15} /> Quit
        </button>
      </footer>
    </main>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
