import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Code2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type {
  ClawDeskSkillItem,
  ClawDeskSettingsOverview,
} from '../../../shared/types/clawdesk-settings';
import { cn } from '../lib/utils';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Separator } from '../components/ui/separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SourceFilter = 'all' | 'codex' | 'agents' | 'openclaw';

const SOURCE_LABELS: Record<string, string> = {
  codex: 'Claude Code',
  agents: 'Agents',
  openclaw: 'OpenClaw',
};

const SOURCE_COLORS: Record<string, string> = {
  codex: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  agents: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  openclaw: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
};

function SourceTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-xs font-semibold',
          active ? 'bg-background/60 text-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function SkillListItem({
  skill,
  selected,
  onClick,
}: {
  skill: ClawDeskSkillItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg px-3 py-3 text-left transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {skill.commandName || skill.name}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-xs',
            SOURCE_COLORS[skill.source] ?? 'bg-muted text-muted-foreground',
          )}
        >
          {SOURCE_LABELS[skill.source] ?? skill.source}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {skill.description || '暂无描述'}
      </p>
    </button>
  );
}

function SkillDetail({ skill }: { skill: ClawDeskSkillItem }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ content: string; overview: string } | null>(null);
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('preview');
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setEditorMode('preview');

    void window.api.clawDesk.getSkillDetail(skill.id).then((result) => {
      if (cancelled) return;
      setDetail({ content: result.content, overview: result.overview });
      setDraftContent(result.content);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [skill.id]);

  const isDirty = detail !== null && draftContent !== detail.content;

  const handleSave = async (): Promise<void> => {
    if (!detail || !skill.editable || !isDirty) return;
    setSaving(true);
    try {
      const updated = await window.api.clawDesk.saveSkillContent(skill.id, draftContent);
      setDetail({ content: updated.content, overview: updated.overview });
      setDraftContent(updated.content);
      setEditorMode('preview');
    } catch (error) {
      console.error('Failed to save skill:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在载入技能详情…
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">无法加载技能详情</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent">
            <Sparkles className="h-6 w-6 text-accent-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight">{skill.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  SOURCE_COLORS[skill.source] ?? 'bg-muted',
                )}
              >
                {SOURCE_LABELS[skill.source] ?? skill.source}
              </span>
              <Badge variant={skill.installed ? 'secondary' : 'outline'}>
                {skill.installed ? 'Installed' : 'Not Found'}
              </Badge>
              <Badge variant={skill.editable ? 'secondary' : 'outline'}>
                {skill.editable ? '可编辑' : '只读'}
              </Badge>
            </div>
          </div>
        </div>

        {skill.editable && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={editorMode === 'preview' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditorMode('preview')}
            >
              预览
            </Button>
            <Button
              type="button"
              variant={editorMode === 'edit' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditorMode('edit')}
            >
              编辑
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={!isDirty || saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        )}
      </div>

      {skill.description && (
        <p className="text-sm leading-7 text-muted-foreground">{skill.description}</p>
      )}

      <div className="rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="text-sm font-semibold text-foreground">概述</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
          {detail.overview}
        </p>
      </div>

      <Separator />

      {skill.editable && editorMode === 'edit' ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">编辑内容</div>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            className="min-h-[380px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm leading-6 text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <p className="text-xs text-muted-foreground">
            当前版本只允许编辑 ~/.codex/skills 与 ~/.agents/skills 下的技能。OpenClaw skills 仍保持只读。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">详细内容</div>
          <div className="prose prose-sm max-w-none rounded-xl border border-border/60 bg-background/30 p-4 dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {detail.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export function Skills() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<ClawDeskSettingsOverview | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadData = async (isRefresh = false): Promise<void> => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const next = await window.api.clawDesk.getSettingsOverview();
      setOverview(next);
      setSelectedId((prev) => {
        if (!prev || !next.skills.some((s) => s.id === prev)) {
          return next.skills[0]?.id ?? null;
        }
        return prev;
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const skills = overview?.skills ?? [];

  const counts: Record<SourceFilter, number> = useMemo(
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
      const sourceMatch = sourceFilter === 'all' || skill.source === sourceFilter;
      const textMatch =
        !normalized ||
        [skill.name, skill.description, skill.commandName, skill.path]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      return sourceMatch && textMatch;
    });
  }, [skills, query, sourceFilter]);

  useEffect(() => {
    if (!selectedId || !filtered.some((s) => s.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((s) => s.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在扫描本机 Skills…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理本机 Claude Code、Agents 和 OpenClaw 技能
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          {refreshing ? '扫描中' : '重新扫描'}
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            { source: 'codex', icon: Code2, label: 'Claude Code Skills' },
            { source: 'agents', icon: Bot, label: 'Agents Skills' },
            { source: 'openclaw', icon: Sparkles, label: 'OpenClaw Skills' },
          ] as const
        ).map(({ source, icon: Icon, label }) => (
          <button
            key={source}
            type="button"
            onClick={() => setSourceFilter(source)}
            className={cn(
              'flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-accent/50',
              sourceFilter === source && 'border-accent bg-accent/30',
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <div className="text-2xl font-bold">{counts[source]}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Main panel */}
      <div className="grid min-h-[520px] gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left: list */}
        <Card className="flex h-[680px] flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-3 pb-3">
            <div className="flex flex-wrap gap-1">
              <SourceTab
                label="全部"
                count={counts.all}
                active={sourceFilter === 'all'}
                onClick={() => setSourceFilter('all')}
              />
              <SourceTab
                label="Claude"
                count={counts.codex}
                active={sourceFilter === 'codex'}
                onClick={() => setSourceFilter('codex')}
              />
              <SourceTab
                label="Agents"
                count={counts.agents}
                active={sourceFilter === 'agents'}
                onClick={() => setSourceFilter('agents')}
              />
              <SourceTab
                label="OpenClaw"
                count={counts.openclaw}
                active={sourceFilter === 'openclaw'}
                onClick={() => setSourceFilter('openclaw')}
              />
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索技能、命令或路径"
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
                  <SkillListItem
                    key={skill.id}
                    skill={skill}
                    selected={selected?.id === skill.id}
                    onClick={() => setSelectedId(skill.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {skills.length === 0
                    ? '暂未发现本机 Skills'
                    : '没有匹配到结果'}
                </p>
                {skills.length === 0 && (
                  <p className="max-w-[220px] text-xs text-muted-foreground/70">
                    检查 ~/.codex/skills、~/.agents/skills 或 ~/.openclaw/skills 目录
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: detail */}
        <Card className="flex h-[680px] flex-col overflow-hidden">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="text-base">技能详情</CardTitle>
            <p className="text-xs text-muted-foreground">
              左侧列表与右侧详情现在各自独立滚动，查看长列表时不会把详情顶出视野。
            </p>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
            {selected ? (
              <SkillDetail skill={selected} />
            ) : (
              <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">从左侧选择一个技能查看详情</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
