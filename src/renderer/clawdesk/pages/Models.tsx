import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FileCog,
  Loader2,
  Mic,
  RefreshCw,
  Save,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { ClawDeskProviderSummaryItem, ClawDeskSettingsOverview } from '../../../shared/types/clawdesk-settings';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';

// ── Field definitions per provider ──────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  description?: string;
}

const VOICE_FIELDS: FieldDef[] = [
  { key: 'VOLCENGINE_APP_ID', label: 'App ID', required: true, placeholder: '火山引擎控制台获取' },
  { key: 'VOLCENGINE_ACCESS_TOKEN', label: 'Access Token', required: true, secret: true, placeholder: '流式语音识别大模型页面获取' },
  { key: 'VOLCENGINE_RESOURCE_ID', label: 'Resource ID', placeholder: 'volc.bigasr.sauc.duration' },
  { key: 'VOLCENGINE_ENABLE_NONSTREAM', label: '启用二遍识别', placeholder: 'true / false' },
  { key: 'VOLCENGINE_BOOSTING_TABLE_ID', label: '热词表 ID', description: '可选：语音热词词表' },
  { key: 'VOLCENGINE_BOOSTING_TABLE_NAME', label: '热词表名称', description: '可选：语音热词词表（与 ID 二选一）' },
  { key: 'VOLCENGINE_CORRECT_TABLE_ID', label: '替换词表 ID', description: '可选：语音替换词词表' },
  { key: 'VOLCENGINE_CORRECT_TABLE_NAME', label: '替换词表名称', description: '可选：语音替换词词表（与 ID 二选一）' },
];

const TEXT_FIELDS: FieldDef[] = [
  { key: 'ARK_API_KEY', label: 'API Key', required: true, secret: true, placeholder: '火山方舟控制台获取' },
  { key: 'DICTATION_REFINEMENT_ENDPOINT_ID', label: 'Endpoint ID', placeholder: 'ep-xxxxxxxxxxxxxxxx', description: '与 Model 二选一' },
  { key: 'DICTATION_REFINEMENT_MODEL', label: 'Model', placeholder: 'doubao-lite-32k', description: '与 Endpoint ID 二选一' },
  { key: 'DICTATION_REFINEMENT_BASE_URL', label: 'Base URL', placeholder: 'https://ark.cn-beijing.volces.com/api/v3' },
  { key: 'DICTATION_REFINEMENT_TIMEOUT_MS', label: '超时 (ms)', placeholder: '4500' },
  { key: 'DICTATION_REFINEMENT_MAX_TOKENS', label: '最大输出长度', placeholder: '220' },
  { key: 'DICTATION_REFINEMENT_TEMPERATURE', label: 'Temperature', placeholder: '0.2' },
];

const PROVIDER_FIELDS: Record<'voice' | 'text', FieldDef[]> = {
  voice: VOICE_FIELDS,
  text: TEXT_FIELDS,
};

// ── Credential form inside the sheet ────────────────────────────────────────

function CredentialForm({
  provider,
  savedKeys,
  onSave,
  onDelete,
  saving,
}: {
  provider: ClawDeskProviderSummaryItem;
  savedKeys: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  saving: boolean;
}) {
  const fields = PROVIDER_FIELDS[provider.id] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  // Initialize form values from saved keys
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = savedKeys[field.key] ?? '';
    }
    setValues(initial);
    setDirty(false);
  }, [savedKeys, fields]);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    for (const field of fields) {
      const val = values[field.key]?.trim();
      if (val) {
        await onSave(field.key, val);
      } else if (savedKeys[field.key]) {
        // Value was cleared — delete it
        await onDelete(field.key);
      }
    }
    setDirty(false);
  }, [fields, values, savedKeys, onSave, onDelete]);

  const handleResetAll = useCallback(async () => {
    for (const field of fields) {
      if (savedKeys[field.key]) {
        await onDelete(field.key);
      }
    }
    setDirty(false);
  }, [fields, savedKeys, onDelete]);

  const hasSavedKeys = Object.keys(savedKeys).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">API 配置</div>
          <div className="text-xs text-muted-foreground">
            {provider.configSource === 'settings'
              ? '当前通过 Settings 配置'
              : provider.configured
                ? '当前通过 .env 配置'
                : '尚未配置'}
          </div>
        </div>
        {provider.configSource === 'settings' && (
          <Badge variant="secondary" className="text-xs">
            Settings
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {fields.map((field) => {
          const isSecret = field.secret;
          const isVisible = visibleKeys[field.key];
          const fromEnv = !savedKeys[field.key] && provider.configured;

          return (
            <div key={field.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-red-500">*</span>}
                </Label>
                {fromEnv && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    .env
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  type={isSecret && !isVisible ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={fromEnv ? '•••••••• (from .env)' : field.placeholder}
                  className="pr-8 font-mono text-sm"
                />
                {isSecret && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setVisibleKeys((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                  >
                    {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              {field.description && (
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存
        </Button>
        {hasSavedKeys && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void handleResetAll()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重置为 .env
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Provider sheet (credentials + guidance) ─────────────────────────────────

function ProviderSheet({
  provider,
  open,
  onOpenChange,
  savedKeys,
  onSave,
  onDelete,
  saving,
}: {
  provider: ClawDeskProviderSummaryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedKeys: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  saving: boolean;
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

          {/* Editable credential form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">配置 API 密钥</CardTitle>
            </CardHeader>
            <CardContent>
              <CredentialForm
                provider={provider}
                savedKeys={savedKeys}
                onSave={onSave}
                onDelete={onDelete}
                saving={saving}
              />
            </CardContent>
          </Card>

          {/* Env keys reference */}
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

          {/* Guidance steps */}
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

          {/* Quick links */}
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
                配置密钥后无需重启，保存即可生效。
              </p>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Models page ────────────────────────────────────────────────────────

export function Models() {
  const [overview, setOverview] = useState<ClawDeskSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<'voice' | 'text' | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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

  // Load saved credential keys when a provider is selected
  useEffect(() => {
    if (!selectedProviderId) {
      setSavedKeys({});
      return;
    }

    let cancelled = false;
    void window.api.clawDesk.getConfigKeys(selectedProviderId).then((keys) => {
      if (!cancelled) setSavedKeys(keys);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedProviderId]);

  const selectedProvider = useMemo(
    () => overview?.providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [overview, selectedProviderId],
  );

  const handleSave = useCallback(async (key: string, value: string) => {
    setSaving(true);
    try {
      const result = await window.api.clawDesk.setConfigKey(key, value);
      if (result.success) {
        setSavedKeys((prev) => ({ ...prev, [key]: value }));
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDelete = useCallback(async (key: string) => {
    setSaving(true);
    try {
      const result = await window.api.clawDesk.deleteConfigKey(key);
      if (result.success) {
        setSavedKeys((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } finally {
      setSaving(false);
    }
  }, []);

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
          配置语音和文本服务商的 API 密钥，或查看当前状态。
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
                        <div className="flex items-center gap-2">
                          {provider.configSource && (
                            <Badge variant="outline" className="text-[10px]">
                              {provider.configSource === 'settings' ? 'Settings' : '.env'}
                            </Badge>
                          )}
                          <Badge variant={provider.configured ? 'secondary' : 'outline'}>
                            {provider.statusLabel}
                          </Badge>
                        </div>
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
                              需要配置 API 密钥
                            </>
                          )}
                        </div>
                        <div className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                          配置
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
                点击上面的服务商卡片，可以直接在 Settings 中配置 API 密钥，也可以通过 .env 文件配置。
              </CardContent>
            </Card>

            <Card className="bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  安全存储
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                通过 Settings 配置的密钥使用 macOS 加密存储，不会以明文保存在磁盘上。
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-blue-600">
                  <Sparkles className="h-4 w-4" />
                  零配置可用
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                即使不配置火山引擎，Mode 1（听写）也可以使用 macOS 内置的 Apple Speech 作为本地备选方案。
                无需网络，无需 API Key，但识别准确率可能低于火山引擎大模型。
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ProviderSheet
        provider={selectedProvider}
        open={selectedProvider !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProviderId(null);
          }
        }}
        savedKeys={savedKeys}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
      />
    </div>
  );
}
