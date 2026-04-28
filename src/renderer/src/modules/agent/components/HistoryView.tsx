/**
 * HistoryView Component.
 * Displays a list of daily summary cards — one per past day's conversations.
 * Loaded when the user clicks the "历史" tab in AgentWindow.
 */

import { useState, useEffect, type ReactNode } from 'react';
import type { DailySummary } from '../../../../../shared/types/agent';

// ─── DaySummaryCard ───────────────────────────────────────────────────────────

interface DaySummaryCardProps {
  summary: DailySummary;
}

function DaySummaryCard({ summary }: DaySummaryCardProps): ReactNode {
  const [expanded, setExpanded] = useState(false);

  // Format date: "2025-06-01" → "6月1日"
  const formattedDate = (() => {
    try {
      const d = new Date(summary.date + 'T00:00:00');
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
      return summary.date;
    }
  })();

  // Format creation time
  const formattedTime = (() => {
    const d = new Date(summary.createdAt);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} 生成`;
  })();

  return (
    <div
      className={`history-card${expanded ? ' history-card--expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="history-card__header">
        <div className="history-card__meta">
          <span className="history-card__date">{formattedDate}</span>
          <span className="history-card__turns">{summary.turnCount} 条对话</span>
        </div>
        <span className="history-card__chevron">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Preview: first line always visible */}
      <p className="history-card__preview">
        {summary.summary.split('\n')[0]}
      </p>

      {/* Full summary when expanded */}
      {expanded && (
        <div className="history-card__body">
          {summary.summary.split('\n').slice(1).map((line, i) => (
            <p key={i} className="history-card__line">
              {line}
            </p>
          ))}
          <p className="history-card__timestamp">{formattedTime}</p>
        </div>
      )}
    </div>
  );
}

// ─── HistoryView ──────────────────────────────────────────────────────────────

interface HistoryViewProps {
  /** Injected from parent when a new summary arrives from the background job */
  latestSummary?: DailySummary | null;
}

export function HistoryView({ latestSummary }: HistoryViewProps): ReactNode {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all summaries on mount
  useEffect(() => {
    let cancelled = false;
    void window.api.agent.getDailySummaries().then((data) => {
      if (!cancelled) {
        setSummaries(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Prepend a new summary when the consolidation job finishes
  useEffect(() => {
    if (!latestSummary) return;
    setSummaries((prev) => {
      const already = prev.some((s) => s.date === latestSummary.date);
      return already
        ? prev.map((s) => (s.date === latestSummary.date ? latestSummary : s))
        : [latestSummary, ...prev];
    });
  }, [latestSummary]);

  if (loading) {
    return (
      <div className="history-view history-view--loading">
        <p>加载中…</p>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="history-view history-view--empty">
        <p>暂无历史记录</p>
        <p className="history-view__hint">
          明天开始的时候，今天的对话会被自动整理成摘要
        </p>
      </div>
    );
  }

  return (
    <div className="history-view">
      {summaries.map((s) => (
        <DaySummaryCard key={s.date} summary={s} />
      ))}
    </div>
  );
}
