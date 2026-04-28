/**
 * ContextBar Component.
 * Shows the captured screen context at the top of the agent window:
 * app icon placeholder, app name, and URL (if browser).
 */

import type { ReactNode } from 'react';
import type { AgentContext } from '../../../../../shared/types/agent';

interface ContextBarProps {
  context: AgentContext | null;
}

export function ContextBar({ context }: ContextBarProps): ReactNode {
  if (!context) {
    return (
      <div className="context-bar context-bar--loading">
        <span className="context-bar__label">正在获取上下文…</span>
      </div>
    );
  }

  return (
    <div className="context-bar">
      <span className="context-bar__app">{context.appName}</span>
      {context.windowTitle && context.windowTitle !== context.appName && (
        <span className="context-bar__title">{context.windowTitle}</span>
      )}
      {context.url && (
        <span className="context-bar__url" title={context.url}>
          {truncateUrl(context.url)}
        </span>
      )}
    </div>
  );
}

function truncateUrl(url: string, max = 48): string {
  try {
    const { hostname, pathname } = new URL(url);
    const display = hostname + pathname;
    return display.length > max ? display.slice(0, max - 1) + '…' : display;
  } catch {
    return url.length > max ? url.slice(0, max - 1) + '…' : url;
  }
}
