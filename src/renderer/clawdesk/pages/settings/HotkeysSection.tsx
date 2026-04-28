import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Keyboard, Loader2, Mic } from 'lucide-react';
import type {
  HotkeyCheckResult,
  HotkeyConfig,
  VoiceTriggerKey,
} from '../../../../shared/types/clawdesk-settings';
import { VOICE_TRIGGER_KEY_LABELS } from '../../../../shared/types/clawdesk-settings';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

function captureAccelerator(e: React.KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Command');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null;

  const keyMap: Record<string, string> = {
    ' ': 'Space', Enter: 'Return', Escape: 'Esc', Backspace: 'Backspace',
    Delete: 'Delete', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left',
    ArrowRight: 'Right', Tab: 'Tab',
  };

  const mapped = keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(mapped);

  const isFKey = /^F\d+$/.test(mapped);
  if (!isFKey && parts.length < 2) return null;

  return parts.join('+');
}

function ConflictBadge({ result }: { result: HotkeyCheckResult | null }) {
  if (!result) return null;
  if (result.isValid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
        <CheckCircle2 className="h-3 w-3" />
        无冲突
      </span>
    );
  }
  return (
    <div className="space-y-1">
      {result.conflicts.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600"
        >
          <AlertTriangle className="h-3 w-3" />
          {c.message}
        </span>
      ))}
    </div>
  );
}

export function HotkeysSection() {
  const [config, setConfig] = useState<HotkeyConfig | null>(null);
  const [draft, setDraft] = useState<HotkeyConfig | null>(null);
  const [capturingToggle, setCapturingToggle] = useState(false);
  const [toggleCheck, setToggleCheck] = useState<HotkeyCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; error?: string } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.api.clawDesk.getHotkeyConfig().then((cfg) => {
      setConfig(cfg);
      setDraft(cfg);
    });
  }, []);

  const isDirty = draft && config && (
    draft.voiceTriggerKey !== config.voiceTriggerKey ||
    draft.toggleWindow !== config.toggleWindow
  );

  const handleTriggerKeyChange = (key: VoiceTriggerKey): void => {
    setDraft((prev) => prev ? { ...prev, voiceTriggerKey: key } : prev);
    setSaveResult(null);
  };

  const handleCaptureKeyDown = useCallback((e: React.KeyboardEvent): void => {
    e.preventDefault();
    const acc = captureAccelerator(e);
    if (!acc) return;

    setDraft((prev) => prev ? { ...prev, toggleWindow: acc } : prev);
    setCapturingToggle(false);
    setSaveResult(null);

    setChecking(true);
    setToggleCheck(null);
    void window.api.clawDesk.checkToggleWindow(acc).then((result) => {
      setToggleCheck(result);
      setChecking(false);
    });
  }, []);

  const handleSave = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    setSaveResult(null);
    const result = await window.api.clawDesk.saveHotkeyConfig(draft);
    setSaveResult(result);
    if (result.success) {
      setConfig(draft);
      setToggleCheck(null);
    }
    setSaving(false);
  };

  if (!draft) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载热键配置…
      </div>
    );
  }

  const triggerLabel = VOICE_TRIGGER_KEY_LABELS[draft.voiceTriggerKey];
  const derivedHotkeys = [
    { action: 'Dictation 模式', keys: triggerLabel, desc: '按下开始，再按停止，识别后插入光标' },
    { action: 'Command 模式', keys: `${triggerLabel} + Shift`, desc: '录音后打开 Answer Overlay 执行 Agent' },
    { action: 'Quick Ask 模式', keys: `${triggerLabel} + Space`, desc: '轻量问答，不抓页面上下文' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="h-4 w-4" />
            语音触发键
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            选择触发所有语音模式的基础按键。Dictation、Command、Quick Ask 共用同一个基础键，通过额外修饰键区分。
          </p>
          <div className="flex gap-2">
            {(Object.keys(VOICE_TRIGGER_KEY_LABELS) as VoiceTriggerKey[]).map((key) => (
              <Button
                key={key}
                type="button"
                variant={draft.voiceTriggerKey === key ? 'default' : 'outline'}
                onClick={() => handleTriggerKeyChange(key)}
                className="gap-2"
              >
                {draft.voiceTriggerKey === key && <CheckCircle2 className="h-3.5 w-3.5" />}
                {VOICE_TRIGGER_KEY_LABELS[key]}
              </Button>
            ))}
          </div>

          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">当前触发键下的完整热键映射：</p>
            {derivedHotkeys.map((hk) => (
              <div
                key={hk.action}
                className="flex items-start gap-4 rounded-lg border border-border/60 bg-background/50 px-4 py-3"
              >
                <div className="shrink-0">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{hk.keys}</code>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{hk.action}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{hk.desc}</div>
                </div>
                <Mic className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              </div>
            ))}
            <div className="flex items-start gap-4 rounded-lg border border-border/60 bg-background/50 px-4 py-3">
              <div className="shrink-0">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{draft.toggleWindow}</code>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">切换主窗口</div>
                <div className="mt-0.5 text-xs text-muted-foreground">显示 / 隐藏 Sarah 调试窗口</div>
              </div>
              <Keyboard className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" />
            Sarah 调试窗口快捷键
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            用于显示 / 隐藏 Sarah 调试窗口的全局快捷键。需要至少一个修饰键（Command、Ctrl 等）。
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {capturingToggle ? (
                <div
                  ref={captureRef}
                  tabIndex={0}
                  onKeyDown={handleCaptureKeyDown}
                  onBlur={() => setCapturingToggle(false)}
                  className="flex-1 rounded-lg border-2 border-blue-500 bg-blue-500/10 px-4 py-3 text-sm font-mono text-blue-600 outline-none cursor-text animate-pulse"
                  autoFocus
                >
                  按下你想要的快捷键组合…
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-border/60 bg-background/50 px-4 py-3 font-mono text-sm text-foreground">
                  {draft.toggleWindow}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCapturingToggle(true);
                  setToggleCheck(null);
                  setTimeout(() => captureRef.current?.focus(), 0);
                }}
                disabled={capturingToggle}
              >
                {capturingToggle ? '等待输入…' : '修改'}
              </Button>
            </div>
            {checking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                检测冲突中…
              </div>
            )}
            <ConflictBadge result={toggleCheck} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/50 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {saveResult?.success
            ? '✓ 热键已应用，立即生效'
            : saveResult?.error
              ? `⚠ ${saveResult.error}`
              : isDirty
                ? '有未保存的更改'
                : '热键设置与当前配置一致'}
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setDraft(config); setToggleCheck(null); setSaveResult(null); }}
            >
              还原
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
          >
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? '应用中…' : '应用'}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        语音触发键（Right Ctrl / Right Alt）使用底层键盘钩子，macOS 系统快捷键冲突检测不适用。
        窗口快捷键使用 Electron 全局快捷键注册，修改后立即生效，无需重启应用。
      </p>
    </div>
  );
}
