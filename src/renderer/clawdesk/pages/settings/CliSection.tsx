import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Code2, ExternalLink, Loader2, Plus, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  ClawDeskCliToolDefinition,
  ClawDeskCliToolStatus,
  OpenClawStatus,
} from '../../../../shared/types/clawdesk-settings';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';
import { useChatStore } from '../../stores/chat';

export function CliSection({
  catalog,
  statuses,
  detecting,
  detectionError,
  onDetect,
}: {
  catalog: ClawDeskCliToolDefinition[];
  statuses: ClawDeskCliToolStatus[];
  detecting: boolean;
  detectionError: string | null;
  onDetect: () => void;
}) {
  const navigate = useNavigate();
  const queuePrompt = useChatStore((state) => state.queuePrompt);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [openClawStatus, setOpenClawStatus] = useState<OpenClawStatus | null>(null);

  useEffect(() => {
    void window.api.clawDesk.getOpenClawStatus().then(setOpenClawStatus);
  }, []);

  const statusMap = useMemo(() => new Map(statuses.map((item) => [item.id, item])), [statuses]);

  const installedTools = useMemo(
    () => catalog.filter((tool) => statusMap.get(tool.id)?.installed).sort((a, b) => a.name.localeCompare(b.name)),
    [catalog, statusMap],
  );

  const recommendedTools = useMemo(
    () => catalog.filter((tool) => tool.recommended).sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  );

  const notInstalledRecommended = useMemo(
    () => recommendedTools.filter((t) => !statusMap.get(t.id)?.installed),
    [recommendedTools, statusMap],
  );

  const selectedTool = useMemo(() => catalog.find((tool) => tool.id === selectedToolId) ?? null, [catalog, selectedToolId]);

  const buildInstallPrompt = useCallback((tool: ClawDeskCliToolDefinition): string => {
    const lines = [
      `帮我安装 ${tool.name} 到工具库。`,
      tool.installCommand ? `安装命令：${tool.installCommand}` : `请先帮我确认 ${tool.name} 的可靠安装命令，并完成安装。`,
      '如果权限不足，请根据实际情况使用 sudo 或等价的提权方式。',
    ];
    if (tool.authRequired) {
      lines.push('该工具安装后通常还需要登录、初始化或完成认证配置，请在安装完成后继续完整引导我。');
    }
    if (tool.postInstallNotes.length > 0) {
      lines.push('', '安装后补充说明：');
      tool.postInstallNotes.forEach((note) => lines.push(`- ${note}`));
    }
    return lines.join('\n');
  }, []);

  const sendToolPromptToChat = useCallback((tool: ClawDeskCliToolDefinition) => {
    queuePrompt(buildInstallPrompt(tool), true);
    navigate('/');
    toast.success(`已把 ${tool.name} 的安装请求发送到 Chat Workspace`);
  }, [buildInstallPrompt, navigate, queuePrompt]);

  const handleRefreshOpenClaw = useCallback(() => {
    void window.api.clawDesk.getOpenClawStatus().then(setOpenClawStatus);
  }, []);

  return (
    <div className="space-y-6">
      {/* Open Claw Status Card */}
      <Card className={openClawStatus?.installed && openClawStatus?.authenticated
        ? 'border-green-500/30 bg-green-500/5'
        : openClawStatus?.installed
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-red-500/20 bg-red-500/5'
      }>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              {openClawStatus?.installed && openClawStatus?.authenticated ? (
                <><CheckCircle2 className="h-4 w-4 text-green-500" /> Open Claw — 就绪</>
              ) : openClawStatus?.installed ? (
                <><ShieldAlert className="h-4 w-4 text-amber-500" /> Open Claw — 已安装，未登录</>
              ) : openClawStatus === null ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Open Claw — 检测中…</>
              ) : (
                <><ShieldAlert className="h-4 w-4 text-red-500" /> Open Claw — 未安装</>
              )}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={handleRefreshOpenClaw}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openClawStatus?.installed && openClawStatus?.authenticated ? (
            <p className="text-sm text-muted-foreground">
              Open Claw CLI 已安装{openClawStatus.version ? ` (v${openClawStatus.version})` : ''}且已登录。Mode 2（语音代理）和 Mode 3（截图代理）可以正常使用。
            </p>
          ) : openClawStatus?.installed ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open Claw CLI 已安装但尚未登录。请在终端运行 <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-xs">openclaw login</code> 完成认证。
              </p>
              <Button type="button" size="sm" className="gap-1" onClick={() => sendToolPromptToChat(catalog.find((t) => t.id === 'openclaw') ?? { id: 'openclaw', name: 'OpenClaw CLI', description: '', category: 'agent', command: 'openclaw', versionArgs: [['--version']], recommended: true, source: '', installCommand: 'brew install openclaw', detailIntro: '', docsUrl: null, repoUrl: null, authRequired: true, postInstallNotes: [] })}>
                <Plus className="h-3.5 w-3.5" />发送登录指引到 Chat
              </Button>
            </div>
          ) : openClawStatus === null ? (
            <p className="text-sm text-muted-foreground">正在检测 Open Claw 安装状态…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open Claw CLI 未安装。它是 Mode 2（语音代理）和 Mode 3（截图代理）的必要依赖。Mode 1（听写）不需要它。
              </p>
              <Button type="button" size="sm" className="gap-1" onClick={() => sendToolPromptToChat(catalog.find((t) => t.id === 'openclaw') ?? { id: 'openclaw', name: 'OpenClaw CLI', description: '', category: 'agent', command: 'openclaw', versionArgs: [['--version']], recommended: true, source: '', installCommand: 'brew install openclaw', detailIntro: '', docsUrl: null, repoUrl: null, authRequired: true, postInstallNotes: [] })}>
                <Plus className="h-3.5 w-3.5" />安装 Open Claw
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          本机 CLI 工具检测。可以看详情，也可以一键把安装提示送进 Chat Workspace。
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onDetect} disabled={detecting}>
          {detecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />检测中</> : <><RefreshCw className="mr-2 h-4 w-4" />重新检测</>}
        </Button>
      </div>

      {detectionError ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          CLI 检测没有完整完成：{detectionError}
        </div>
      ) : null}

      {statuses.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div><div className="text-xl font-bold">{installedTools.length}</div><div className="text-xs text-muted-foreground">已安装</div></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
            <Wrench className="h-5 w-5 text-muted-foreground" />
            <div><div className="text-xl font-bold">{catalog.length}</div><div className="text-xs text-muted-foreground">已收录工具</div></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/30 p-4">
            <Code2 className="h-5 w-5 text-muted-foreground/50" />
            <div><div className="text-xl font-bold">{notInstalledRecommended.length}</div><div className="text-xs text-muted-foreground">推荐但未安装</div></div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            已安装
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detecting && statuses.length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />正在检测本机 CLI 工具…
            </div>
          ) : installedTools.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {installedTools.map((tool) => {
                const status = statusMap.get(tool.id);
                return (
                  <div key={tool.id} className="rounded-lg border border-border/60 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{tool.name}</div>
                        <code className="text-xs text-muted-foreground">{tool.command}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1 shrink-0">
                          <CheckCircle2 className="h-3 w-3" />{status?.version ?? 'Installed'}
                        </Badge>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedToolId(tool.id)}>详情</Button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{tool.description}</p>
                    {status?.path && <p className="mt-2 truncate text-xs text-muted-foreground/60">{status.path}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
              {statuses.length === 0 ? '点击"重新检测"扫描本机工具。' : '暂未检测到已安装工具。'}
            </div>
          )}
        </CardContent>
      </Card>

      {notInstalledRecommended.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />推荐安装</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-2">
            {notInstalledRecommended.map((tool) => (
              <div key={tool.id} className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{tool.name}</div>
                    <code className="text-xs text-muted-foreground">{tool.command}</code>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize text-xs">{tool.category}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{tool.description}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedToolId(tool.id)}>查看详细信息</Button>
                  <Button type="button" size="sm" className="gap-1" onClick={() => sendToolPromptToChat(tool)}>
                    <Plus className="h-3.5 w-3.5" />添加到 Chat
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Sheet open={selectedTool !== null} onOpenChange={(open) => !open && setSelectedToolId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedTool ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedTool.name}</SheetTitle>
                <SheetDescription>{selectedTool.command}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusMap.get(selectedTool.id)?.installed ? 'secondary' : 'outline'}>
                    {statusMap.get(selectedTool.id)?.installed ? '已安装' : '推荐安装'}
                  </Badge>
                  <Badge variant="outline" className="capitalize">{selectedTool.category}</Badge>
                  {selectedTool.authRequired ? <Badge variant="outline">需要登录 / 配置</Badge> : null}
                </div>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">工具概述</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                    <p>{selectedTool.detailIntro}</p>
                    <p>{selectedTool.description}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">安装建议</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-3 font-mono text-sm text-foreground">
                      {selectedTool.installCommand ?? '当前目录里还没有预设安装命令，需要先让 Agent 帮你确认。'}
                    </div>
                    {selectedTool.postInstallNotes.length > 0 ? (
                      <div className="space-y-2">
                        {selectedTool.postInstallNotes.map((note) => (
                          <div key={note} className="rounded-lg border border-border/50 bg-background/40 px-3 py-3 text-sm leading-6 text-muted-foreground">{note}</div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {(selectedTool.docsUrl || selectedTool.repoUrl) ? (
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">参考链接</CardTitle></CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {selectedTool.docsUrl ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => { if (selectedTool.docsUrl) void window.api.clawDesk.openExternal(selectedTool.docsUrl); }}>
                          <ExternalLink className="mr-2 h-4 w-4" />官方文档
                        </Button>
                      ) : null}
                      {selectedTool.repoUrl ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => { if (selectedTool.repoUrl) void window.api.clawDesk.openExternal(selectedTool.repoUrl); }}>
                          <ExternalLink className="mr-2 h-4 w-4" />GitHub
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                {!statusMap.get(selectedTool.id)?.installed ? (
                  <div className="flex justify-end">
                    <Button type="button" className="gap-2" onClick={() => sendToolPromptToChat(selectedTool)}>
                      <Plus className="h-4 w-4" />把安装提示送进 Chat Workspace
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
