import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  FileCog,
  Loader2,
  Mic,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { ClawDeskProviderSummaryItem, ClawDeskSettingsOverview } from '../../../shared/types/clawdesk-settings';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';

function ProviderGuideSheet({
  provider,
  open,
  onOpenChange,
}: {
  provider: ClawDeskProviderSummaryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!provider) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{provider.label}</SheetTitle>
          <SheetDescription>{provider.provider}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{provider.statusLabel}</div>
                <div className="mt-1 text-sm text-muted-foreground">{provider.detail}</div>
              </div>
              <Badge variant={provider.configured ? 'secondary' : 'outline'}>
                {provider.configured ? 'Ready' : 'Needs Setup'}
              </Badge>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">需要配置的环境变量</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {provider.envKeys.map((envKey) => (
                <div
                  key={envKey}
                  className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 font-mono text-sm text-foreground"
                >
                  {envKey}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">配置步骤</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {provider.guidance.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {index + 1}
                  </div>
                  <div className="text-sm leading-6 text-muted-foreground">{step}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">一键直达</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => void window.api.clawDesk.openPath(provider.envFilePath)}
                >
                  <FileCog className="h-4 w-4" />
                  打开 .env
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => void window.api.clawDesk.openPath(provider.envExamplePath)}
                >
                  <Wrench className="h-4 w-4" />
                  打开 .env.example
                </Button>
                {provider.documentationUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => {
                      if (provider.documentationUrl) {
                        void window.api.clawDesk.openExternal(provider.documentationUrl);
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    查看官方文档
                  </Button>
                )}
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                改完环境变量后，需要重启应用，新的服务商配置才会被语音和文本链路读取。
              </p>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Models() {
  const [overview, setOverview] = useState<ClawDeskSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<'voice' | 'text' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const nextOverview = await window.api.clawDesk.getSettingsOverview();
        if (!cancelled) {
          setOverview(nextOverview);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider = useMemo(
    () => overview?.providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [overview, selectedProviderId],
  );

  const providerCards = useMemo(
    () =>
      (overview?.providers ?? []).map((provider) => ({
        ...provider,
        icon: provider.id === 'voice' ? Mic : Sparkles,
      })),
    [overview],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把当前 Sarah 实际用到的服务商状态、配置入口和下一步操作先做清楚。
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border/70 bg-card/40">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取服务商状态…
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {providerCards.map((provider) => {
              const Icon = provider.icon;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProviderId(provider.id)}
                  className="rounded-2xl border border-border/70 bg-card/50 p-0 text-left transition-all hover:border-primary/30 hover:bg-card/70"
                >
                  <Card className="border-0 bg-transparent shadow-none">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent">
                            <Icon className="h-5 w-5 text-accent-foreground" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{provider.label}</CardTitle>
                            <div className="mt-1 text-sm text-muted-foreground">{provider.provider}</div>
                          </div>
                        </div>
                        <Badge variant={provider.configured ? 'secondary' : 'outline'}>
                          {provider.statusLabel}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-6 text-muted-foreground">{provider.detail}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {provider.configured ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              当前链路已可用
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-amber-500" />
                              需要补全环境变量
                            </>
                          )}
                        </div>
                        <div className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                          查看配置说明
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                  Dictation refinement
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                当前听写整理默认走轻量文本模型，不再走 OpenClaw main agent 重链路。
              </CardContent>
            </Card>

            <Card className="bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  语音链路
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                语音服务商配置仍然通过 `.env` 管理。这里先做状态与引导，不在这一页直接改密钥。
              </CardContent>
            </Card>

            <Card className="bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  服务商策略
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                点击上面的服务商卡片，可以直接看到需要配置哪些变量、参考文件在哪里，以及该去哪里继续配置。
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ProviderGuideSheet
        provider={selectedProvider}
        open={selectedProvider !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProviderId(null);
          }
        }}
      />
    </div>
  );
}
