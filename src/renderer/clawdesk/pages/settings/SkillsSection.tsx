import { useEffect, useMemo, useState } from 'react';
import { Bot, Code2, Filter, Loader2, Search, Sparkles } from 'lucide-react';
import { Separator } from '../../components/ui/separator';
import type { ClawDeskSkillDetail, ClawDeskSkillItem } from '../../../../shared/types/clawdesk-settings';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SkillsSourceFilter = 'all' | 'codex' | 'agents' | 'openclaw';

const SKILL_SOURCE_LABELS: Record<string, string> = {
  codex: 'Claude Code',
  agents: 'Agents',
  openclaw: 'OpenClaw',
};

export function SkillsSection({ skills }: { skills: ClawDeskSkillItem[] }) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SkillsSourceFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ClawDeskSkillDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('preview');
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const counts = useMemo<Record<SkillsSourceFilter, number>>(
    () => ({
      all: skills.length,
      codex: skills.filter((s) => s.source === 'codex').length,
      agents: skills.filter((s) => s.source === 'agents').length,
      openclaw: skills.filter((s) => s.source === 'openclaw').length,
    }),
    [skills],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return skills.filter((skill) => {
      const srcMatch = sourceFilter === 'all' || skill.source === sourceFilter;
      const textMatch =
        !normalized ||
        [skill.name, skill.description, skill.commandName, skill.path]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      return srcMatch && textMatch;
    });
  }, [query, skills, sourceFilter]);

  const isDirty = selectedDetail !== null && draftContent !== selectedDetail.content;

  useEffect(() => {
    if (!selectedId || !filtered.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setDraftContent('');
      setDetailError(null);
      return;
    }

    let cancelled = false;
    const loadDetail = async (): Promise<void> => {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const detail = await window.api.clawDesk.getSkillDetail(selectedId);
        if (cancelled) return;
        setSelectedDetail(detail);
        setDraftContent(detail.content);
        setEditorMode('preview');
      } catch (error) {
        if (cancelled) return;
        setSelectedDetail(null);
        setDraftContent('');
        setDetailError(error instanceof Error ? error.message : 'Failed to load skill detail.');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };

    void loadDetail();
    return () => { cancelled = true; };
  }, [selectedId]);

  const filterTabs: Array<{ id: SkillsSourceFilter; label: string; icon: typeof Bot }> = [
    { id: 'all', label: `全部 (${counts.all})`, icon: Sparkles },
    { id: 'codex', label: `Claude (${counts.codex})`, icon: Code2 },
    { id: 'agents', label: `Agents (${counts.agents})`, icon: Bot },
    { id: 'openclaw', label: `OpenClaw (${counts.openclaw})`, icon: Sparkles },
  ];

  const handleSelectSkill = (nextId: string): void => {
    if (nextId === selectedId) return;
    if (isDirty) {
      setPendingSelectionId(nextId);
      setShowDiscardConfirm(true);
      return;
    }
    setSelectedId(nextId);
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedDetail || !selectedDetail.editable || !isDirty) return;
    setSaving(true);
    setDetailError(null);
    try {
      const updated = await window.api.clawDesk.saveSkillContent(selectedDetail.id, draftContent);
      setSelectedDetail(updated);
      setDraftContent(updated.content);
      setEditorMode('preview');
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Failed to save skill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {filterTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSourceFilter(id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              sourceFilter === id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex h-[680px] flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-2 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能、命令或功能"
                className="pl-9"
              />
            </div>
            {query && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3 w-3" />
                找到 {filtered.length} 个匹配结果
              </div>
            )}
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {filtered.length > 0 ? (
              <div className="space-y-1">
                {filtered.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => handleSelectSkill(skill.id)}
                    className={cn(
                      'w-full rounded-lg px-3 py-3 text-left transition-colors',
                      selectedId === skill.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{skill.commandName || skill.name}</span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {SKILL_SOURCE_LABELS[skill.source] ?? skill.source}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{skill.description || skill.name}</div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant={skill.editable ? 'secondary' : 'outline'} className="text-[10px]">
                        {skill.editable ? 'Editable' : 'Read-only'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Sparkles className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {skills.length === 0 ? '暂未发现本机 Skills' : '没有匹配到技能'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-[680px] flex-col overflow-hidden">
          <CardHeader className="shrink-0 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">技能详情</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  左侧列表与右侧详情现在各自独立滚动，查看长列表时不会把详情顶出视野。
                </p>
              </div>
              {selectedDetail?.editable ? (
                <div className="flex items-center gap-2">
                  <Button type="button" variant={editorMode === 'preview' ? 'default' : 'outline'} size="sm" onClick={() => setEditorMode('preview')}>预览</Button>
                  <Button type="button" variant={editorMode === 'edit' ? 'default' : 'outline'} size="sm" onClick={() => setEditorMode('edit')}>编辑</Button>
                  <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!isDirty || saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    保存
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {loadingDetail ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在载入技能详情…
              </div>
            ) : detailError ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="max-w-md rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-muted-foreground">{detailError}</div>
              </div>
            ) : selectedDetail ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm text-foreground">{selectedDetail.commandName}</code>
                  <Badge variant="outline">{SKILL_SOURCE_LABELS[selectedDetail.source] ?? selectedDetail.source}</Badge>
                  <Badge variant={selectedDetail.installed ? 'secondary' : 'outline'}>{selectedDetail.installed ? 'Installed' : 'Not Found'}</Badge>
                  <Badge variant={selectedDetail.editable ? 'secondary' : 'outline'}>{selectedDetail.editable ? '可编辑' : '只读'}</Badge>
                </div>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">{selectedDetail.name}</h3>
                  {selectedDetail.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{selectedDetail.description}</p>
                  )}
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-sm font-semibold text-foreground">概述</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{selectedDetail.overview}</p>
                </div>
                <Separator />
                {selectedDetail.editable && editorMode === 'edit' ? (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-foreground">编辑内容</div>
                    <Textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      className="min-h-[380px] resize-none font-mono text-sm leading-6"
                    />
                    <p className="text-xs text-muted-foreground">
                      当前版本只允许编辑 `~/.codex/skills` 与 `~/.agents/skills` 下的技能。OpenClaw skills 仍保持只读。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-foreground">详细内容</div>
                    <div className="prose prose-sm max-w-none rounded-xl border border-border/60 bg-background/30 p-4 dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDetail.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">从左侧选择一个技能查看详情</div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showDiscardConfirm}
        title="放弃未保存的修改？"
        message="你刚刚改过这个技能，还没有保存。如果现在切换到别的技能，这些修改会丢失。"
        confirmLabel="放弃并切换"
        cancelLabel="继续编辑"
        variant="destructive"
        onConfirm={() => {
          if (pendingSelectionId) setSelectedId(pendingSelectionId);
          setPendingSelectionId(null);
          setShowDiscardConfirm(false);
        }}
        onCancel={() => { setPendingSelectionId(null); setShowDiscardConfirm(false); }}
      />
    </div>
  );
}
