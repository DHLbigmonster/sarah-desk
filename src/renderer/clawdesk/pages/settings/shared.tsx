import { Loader2, Settings2, Keyboard, PlugZap, Sparkles, Code2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type SettingsSection = 'general' | 'hotkeys' | 'providers' | 'skills' | 'cli';

interface SectionNavItem {
  id: SettingsSection;
  label: string;
  icon: typeof Settings2;
  description: string;
}

export const SETTINGS_SECTIONS: SectionNavItem[] = [
  { id: 'general', label: '通用', icon: Settings2, description: '版本、外观和桌面应用基础信息' },
  { id: 'hotkeys', label: '热键', icon: Keyboard, description: '自定义语音触发键与窗口快捷键' },
  { id: 'providers', label: '服务商', icon: PlugZap, description: '语音与轻量文本服务商摘要' },
  { id: 'skills', label: 'Skills', icon: Sparkles, description: '本机技能与 OpenClaw 技能同步视图' },
  { id: 'cli', label: 'CLI', icon: Code2, description: '推荐 CLI 工具与本地安装检测' },
];

export function LoadingPanel() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-border/70 bg-card/60">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在载入设置数据…
      </div>
    </div>
  );
}

export function SectionNav({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-1 rounded-xl border border-border/70 bg-card/50 p-2">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeSection;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={cn(
              'rounded-lg px-3 py-3 text-left transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">{section.label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{section.description}</div>
              </div>
            </div>
          </button>
        );
      })}
    </aside>
  );
}

export function SettingRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/50 px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className={cn('text-sm text-right', muted ? 'text-muted-foreground' : 'text-foreground')}>
        <span className="break-all">{value}</span>
      </span>
    </div>
  );
}
