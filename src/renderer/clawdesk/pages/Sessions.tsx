// Phase 2: real session list. Current session = today's in-memory chat.
// Historical sessions = DailySummary entries produced by the consolidation service.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, CalendarDays } from 'lucide-react';
import type { DailySummary } from '../../../shared/types/agent';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chat';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function Sessions() {
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const messages = useChatStore((s) => s.messages);
  const newSession = useChatStore((s) => s.newSession);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await window.api.agent.getDailySummaries();
        if (!cancelled) setSummaries(rows);
      } catch {
        if (!cancelled) setSummaries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const off = window.api.agent.onDailySummaryReady(() => {
      void (async () => {
        const rows = await window.api.agent.getDailySummaries();
        setSummaries(rows);
      })();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const userTurns = messages.filter((m) => m.role === 'user').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            One session per day. Prior days are auto-summarised in the background.
          </p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            await newSession();
            navigate('/');
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Today
        </h2>
        <button
          onClick={() => navigate('/')}
          className={cn(
            'flex w-full items-start gap-3 rounded-lg border bg-card/40 p-4 text-left transition-colors',
            'hover:bg-black/5 dark:hover:bg-white/5',
          )}
        >
          <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{formatDate(today)}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Active
              </span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {userTurns === 0
                ? 'No messages yet.'
                : `${userTurns} user turn${userTurns === 1 ? '' : 's'} · ${messages.length} total`}
            </div>
          </div>
        </button>
      </section>

      <section className="min-h-0 flex-1">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          History
        </h2>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !summaries || summaries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No historical sessions yet. Past days appear here after the next consolidation run.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {summaries.map((s) => (
              <SummaryCard key={s.date} summary={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ summary }: { summary: DailySummary }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card/40 p-4">
      <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{formatDate(summary.date)}</span>
          <span className="text-xs text-muted-foreground">
            {summary.turnCount} turn{summary.turnCount === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{summary.summary}</p>
      </div>
    </div>
  );
}
