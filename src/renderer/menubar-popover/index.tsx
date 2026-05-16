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
  CtrlRight: '右 Ctrl',
  AltRight: '右 Option',
  CapsLock: 'Caps Lock',
  MetaRight: '右 Command',
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
    return `按键 ${config.customKeycode ?? '?'}`;
  }
  return TRIGGER_KEY_LABELS[config.voiceTriggerKey] ?? config.voiceTriggerKey;
}

function voiceStateText(state: MiniStatus['hotkeys']['currentVoiceState']): string {
  switch (state) {
    case 'dictation_recording':
      return '听写中';
    case 'command_recording':
      return '命令中';
    case 'quickask_recording':
      return '快问中';
    default:
      return '就绪';
  }
}

function gatewayTone(state: MiniStatus['gateway']['state']): Tone {
  if (state === 'connected') return 'ok';
  if (state === 'loading') return 'warn';
  return 'error';
}

function runtimeLabel(runtimeId: MiniStatus['agent']['effectiveRuntime']): string {
  if (runtimeId === 'hermes') return 'Hermes';
  if (runtimeId === 'codex') return 'Codex';
  if (runtimeId === 'claude') return 'Claude';
  if (runtimeId === 'openclaw') return 'OpenClaw';
  return '未连接';
}

function providerTone(configured: boolean): Tone {
  return configured ? 'ok' : 'warn';
}

function providerDetail(configured: boolean, detail: string, fallback: string): string {
  if (detail) return detail;
  return configured ? '已配置' : fallback;
}

function permissionIssues(status: MiniStatus): string[] {
  return [
    status.permissions.microphone !== 'granted' ? '麦克风' : null,
    !status.permissions.accessibility ? '辅助功能' : null,
    !status.permissions.inputMonitoring ? '输入监控' : null,
    status.permissions.screenRecording !== 'granted' ? '屏幕录制' : null,
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
  const triggerLabel = status ? hotkeyLabel(status.hotkeys.hotkeyConfig) : '加载中';
  const voiceTone: Tone = status?.hotkeys.currentVoiceState === 'idle' ? 'ok' : 'warn';
  const recorderReady = status ? status.recorder.created && status.recorder.ready : false;
  const startVoiceAction = useCallback((action: () => Promise<{ success: boolean }>) => {
    void action().then(() => window.api.mini.hidePopover());
  }, []);

  return (
    <main className="popover">
      <div className="popover__arrow" />
      <header className="titlebar">
        <div>
          <div className="titlebar__brand">
            <AudioLines size={17} strokeWidth={2.2} />
            <h1>Sarah</h1>
          </div>
          <p>{status ? voiceStateText(status.hotkeys.currentVoiceState) : '正在加载'}</p>
        </div>
        <div className="titlebar__actions">
          <button className="icon-button" type="button" title="设置" aria-label="设置" onClick={() => void window.api.mini.showSettings()}>
            <Settings size={16} />
          </button>
          <button className="icon-button" type="button" title="关闭" aria-label="关闭" onClick={() => void window.api.mini.hidePopover()}>
            <X size={16} />
          </button>
        </div>
      </header>

      {error ? (
        <section className="error-panel">
          <ShieldAlert size={18} />
          <div>
            <strong>状态不可用</strong>
            <span>{error}</span>
          </div>
        </section>
      ) : null}

      <section className="hero-band">
        <div className="hero-band__status">
          <span className={`live-dot live-dot--${voiceTone}`} />
          <span>{status ? voiceStateText(status.hotkeys.currentVoiceState) : '检查中'}</span>
        </div>
        <div className="hero-band__hint">
          <kbd>{triggerLabel}</kbd>
          <span>按住开始听写</span>
        </div>
      </section>

      <section className="quick-actions" aria-label="Voice actions">
        <button className="primary-action" type="button" onClick={() => startVoiceAction(window.api.mini.toggleDictation)}>
          <Mic size={18} />
          <span>听写</span>
        </button>
        <button className="primary-action primary-action--secondary" type="button" onClick={() => startVoiceAction(window.api.mini.toggleCommand)}>
          <Command size={18} />
          <span>命令</span>
        </button>
        <button className="primary-action primary-action--secondary" type="button" onClick={() => startVoiceAction(window.api.mini.toggleQuickAsk)}>
          <Bot size={18} />
          <span>快问</span>
        </button>
      </section>

      <section className="permission-strip">
        <div>
          <ShieldAlert size={15} />
          <span>{issues.length === 0 ? '权限正常' : `缺少${issues.join('、')}`}</span>
        </div>
        {issues.length === 0 ? (
          <StatusPill tone="ok"><Check size={12} /> OK</StatusPill>
        ) : (
          <button className="text-button" type="button" onClick={() => void window.api.mini.openPermissions()}>
            去开启 <ChevronRight size={13} />
          </button>
        )}
      </section>

      <section className="status-list" aria-label="Runtime status">
        {status ? (
          <>
            <StatusRow
              icon={<Activity size={16} />}
              label="网关"
              value={status.gateway.state === 'connected' ? '已连接' : status.gateway.state === 'loading' ? '检查中' : '离线'}
              detail={status.gateway.url.replace(/^https?:\/\//, '')}
              tone={gatewayTone(status.gateway.state)}
            />
            <StatusRow
              icon={<Mic size={16} />}
              label="语音识别"
              value={status.asrProvider.name}
              detail={providerDetail(status.asrProvider.configured, status.asrProvider.detail, '本地')}
              tone={providerTone(status.asrProvider.configured)}
            />
            <StatusRow
              icon={<Sparkles size={16} />}
              label="文本润色"
              value={status.refinementProvider.name}
              detail={providerDetail(status.refinementProvider.configured, status.refinementProvider.detail, '降级')}
              tone={providerTone(status.refinementProvider.configured)}
            />
            <StatusRow
              icon={<Bot size={16} />}
              label="代理"
              value={runtimeLabel(status.agent.effectiveRuntime)}
              detail={status.agent.available ? '可用' : '需安装'}
              tone={status.agent.available ? 'ok' : 'error'}
            />
            <StatusRow
              icon={<AudioLines size={16} />}
              label="录音器"
              value={recorderReady ? '就绪' : '启动中'}
              detail={status.recorder.asrStatus}
              tone={recorderReady ? 'ok' : 'warn'}
            />
          </>
        ) : (
          <div className="status-list__loading">正在加载状态…</div>
        )}
      </section>

      <footer className="footer">
        <button type="button" className="footer-button" onClick={() => void window.api.mini.showLogs()}>
          <FileText size={15} /> 日志
        </button>
        <button type="button" className="footer-button" onClick={() => void load()}>
          <SquareTerminal size={15} /> {refreshing ? '检查中' : '刷新'}
        </button>
        <button type="button" className="footer-button footer-button--danger" onClick={() => void window.api.mini.quit()}>
          <Power size={15} /> 退出
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
