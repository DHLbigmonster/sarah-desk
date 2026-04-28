import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import type { ClawDeskSettingsOverview, ClawDeskCliToolStatus, ClawDeskThemeMode } from '../../../shared/types/clawdesk-settings';
import { useUiStore } from '../stores/ui';
import { LoadingPanel, SectionNav, type SettingsSection } from './settings/shared';
import { GeneralSection } from './settings/GeneralSection';
import { HotkeysSection } from './settings/HotkeysSection';
import { ProvidersSection } from './settings/ProvidersSection';
import { SkillsSection } from './settings/SkillsSection';
import { CliSection } from './settings/CliSection';

export function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [overview, setOverview] = useState<ClawDeskSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [detectingCli, setDetectingCli] = useState(false);
  const [cliDetectionAttempted, setCliDetectionAttempted] = useState(false);
  const [cliDetectionError, setCliDetectionError] = useState<string | null>(null);
  const [cliStatuses, setCliStatuses] = useState<ClawDeskCliToolStatus[]>([]);
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const next = await window.api.clawDesk.getSettingsOverview();
        if (cancelled) return;
        setOverview(next);
        setThemeMode(next.themeMode);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [setThemeMode]);

  useEffect(() => {
    if (activeSection !== 'cli' || cliDetectionAttempted || detectingCli) return;
    let cancelled = false;
    const detect = async (): Promise<void> => {
      setDetectingCli(true);
      setCliDetectionError(null);
      try {
        const next = await window.api.clawDesk.detectCliTools();
        if (!cancelled) setCliStatuses(next);
      } catch (error) {
        if (!cancelled) {
          setCliDetectionError(error instanceof Error ? error.message : 'CLI 检测失败。');
          setCliStatuses([]);
        }
      } finally {
        if (!cancelled) { setCliDetectionAttempted(true); setDetectingCli(false); }
      }
    };
    void detect();
    return () => { cancelled = true; };
  }, [activeSection, cliDetectionAttempted, detectingCli]);

  const handleThemeChange = async (next: ClawDeskThemeMode): Promise<void> => {
    setThemeMode(next);
    try {
      await window.api.clawDesk.setThemeMode(next);
    } catch {
      setThemeMode(overview?.themeMode ?? 'system');
    }
  };

  const handleCliDetect = async (): Promise<void> => {
    setDetectingCli(true);
    setCliDetectionError(null);
    try {
      const next = await window.api.clawDesk.detectCliTools();
      setCliStatuses(next);
      setCliDetectionAttempted(true);
    } catch (error) {
      setCliStatuses([]);
      setCliDetectionAttempted(true);
      setCliDetectionError(error instanceof Error ? error.message : 'CLI 检测失败。');
    } finally {
      setDetectingCli(false);
    }
  };

  const renderSection = (): React.ReactNode => {
    if (!overview) return <LoadingPanel />;
    switch (activeSection) {
      case 'general':
        return <GeneralSection overview={overview} themeMode={themeMode} onThemeChange={(t) => void handleThemeChange(t)} />;
      case 'hotkeys':
        return <HotkeysSection />;
      case 'providers':
        return <ProvidersSection providers={overview.providers} />;
      case 'skills':
        return <SkillsSection skills={overview.skills} />;
      case 'cli':
        return (
          <CliSection
            catalog={overview.cliCatalog}
            statuses={cliStatuses}
            detecting={detectingCli}
            detectionError={cliDetectionError}
            onDetect={() => void handleCliDetect()}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          先把 Sarah 的通用配置、服务商摘要、Skills 和 CLI 工具入口做成真正可用的设置中心。
        </p>
      </div>

      <div className="grid min-h-[640px] gap-6 xl:grid-cols-[256px_minmax(0,1fr)]">
        <SectionNav activeSection={activeSection} onSelect={setActiveSection} />

        <section className="min-w-0">
          {loading ? <LoadingPanel /> : renderSection()}

          {!loading && activeSection === 'skills' && (
            <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
              OpenClaw skills 的删除联动和双向同步已经纳入架构，但这类动作会影响外部技能目录。这一轮先把读取与展示做稳，后续再安全加写回。
            </div>
          )}

          {!loading && activeSection === 'cli' && overview && (
            <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
              推荐清单参考了 CodePilot 的工具目录，并结合当前项目运行时做了裁剪。CLI 状态采用延迟检测，避免第一次打开设置页就卡住。
            </div>
          )}

          {!loading && activeSection === 'general' && overview?.versionInfo.githubRepo && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
              仓库来源：{overview.versionInfo.githubRepo}
            </div>
          )}

          {!loading && activeSection === 'providers' && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              {overview?.providers.some((item) => item.configured) ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              服务商页当前只展示摘要，不在这一轮里接密钥编辑表单。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
