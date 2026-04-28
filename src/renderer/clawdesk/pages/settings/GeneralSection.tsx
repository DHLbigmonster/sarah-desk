import { AppWindow, Moon, Package, Paintbrush, Sun } from 'lucide-react';
import type { ClawDeskSettingsOverview, ClawDeskThemeMode } from '../../../../shared/types/clawdesk-settings';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { SettingRow } from './shared';

export function GeneralSection({
  overview,
  themeMode,
  onThemeChange,
}: {
  overview: ClawDeskSettingsOverview;
  themeMode: ClawDeskThemeMode;
  onThemeChange: (theme: ClawDeskThemeMode) => void;
}) {
  const themeOptions: Array<{ id: ClawDeskThemeMode; label: string; icon: typeof Sun }> = [
    { id: 'light', label: '浅色', icon: Sun },
    { id: 'dark', label: '深色', icon: Moon },
    { id: 'system', label: '跟随系统', icon: AppWindow },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            版本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingRow label="Sarah 版本" value={overview.versionInfo.appVersion} />
          <SettingRow
            label="运行时"
            value={`Electron ${overview.versionInfo.electronVersion} / Node ${overview.versionInfo.nodeVersion}`}
            muted
          />
          <SettingRow label="平台" value={overview.versionInfo.platform} muted />
          <SettingRow
            label="自动更新"
            value={overview.versionInfo.autoUpdateConfigured ? '已配置' : '暂未配置'}
            muted={!overview.versionInfo.autoUpdateConfigured}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paintbrush className="h-4 w-4" />
            外观
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const active = option.id === themeMode;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => onThemeChange(option.id)}
                  className="justify-start gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            当前：{themeMode === 'system' ? '跟随系统' : themeMode === 'dark' ? '深色' : '浅色'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
