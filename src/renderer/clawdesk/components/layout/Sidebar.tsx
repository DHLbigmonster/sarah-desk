// Adapted from ClawX (https://github.com/ValueCell-ai/ClawX) — MIT © 2026 ValueCell Team. Modifications © Sarah contributors.
/**
 * Sidebar Component
 * Navigation sidebar with real ClawDesk routes.
 * Keeps the ClawX shell, but only exposes routes that are actually usable.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  LayoutList,
  AppWindow,
  BrainCircuit,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { BrandIcon } from '../ui/BrandIcon';
import { cn } from '../../lib/utils';
import { useUiStore } from '../../stores/ui';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useChatStore } from '../../stores/chat';
import type { DailySummary } from '../../../../shared/types/agent';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  collapsed?: boolean;
  onClick?: () => void;
  testId?: string;
}

function NavItem({ to, icon, label, badge, collapsed, onClick, testId }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      data-testid={testId}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          'hover:bg-black/[0.05]',
          isActive
            ? 'bg-black/[0.05] text-foreground'
            : 'text-foreground/75',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className={cn('flex shrink-0 items-center justify-center', isActive ? 'text-foreground' : 'text-muted-foreground')}>
            {icon}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
              {badge && (
                <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] font-semibold">
                  {badge}
                </Badge>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const navigate = useNavigate();
  const location = useLocation();
  const messages = useChatStore((state) => state.messages);
  const hydrated = useChatStore((state) => state.hydrated);
  const hydrate = useChatStore((state) => state.hydrate);
  const newSession = useChatStore((state) => state.newSession);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [workspaceAvailable, setWorkspaceAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const [rows, status] = await Promise.all([
          window.api.agent.getDailySummaries(),
          window.api.clawDesk.getStatus(),
        ]);
        if (cancelled) return;
        setSummaries(rows);
        setWorkspaceAvailable(status.workspaceAvailable);
      } catch {
        if (cancelled) return;
        setSummaries([]);
        setWorkspaceAvailable(false);
      }
    };

    void load();
    const offSummary = window.api.agent.onDailySummaryReady((summary) => {
      if (cancelled) return;
      setSummaries((current) => {
        const next = [summary, ...current.filter((item) => item.date !== summary.date)];
        return next.slice(0, 6);
      });
    });

    return () => {
      cancelled = true;
      offSummary();
    };
  }, []);

  const userTurns = useMemo(
    () => messages.filter((message) => message.role === 'user').length,
    [messages],
  );

  const recentHistory = useMemo(() => summaries.slice(0, 5), [summaries]);

  const currentPreview = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.role === 'user' || message.role === 'assistant');
    if (!last?.content) return 'No messages yet';
    return last.content.length > 56 ? `${last.content.slice(0, 56)}…` : last.content;
  }, [messages]);

  const navItems: NavItemProps[] = [
    { to: '/', icon: <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2} />, label: 'Chat Workspace', testId: 'sidebar-nav-chat' },
    { to: '/sessions', icon: <LayoutList className="h-[18px] w-[18px]" strokeWidth={2} />, label: 'Sessions', testId: 'sidebar-nav-sessions' },
    {
      to: '/workspace',
      icon: <AppWindow className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: 'OpenClaw Workspace',
      testId: 'sidebar-nav-workspace',
      badge: workspaceAvailable === false ? 'Offline' : undefined,
    },
    { to: '/models', icon: <BrainCircuit className="h-[18px] w-[18px]" strokeWidth={2} />, label: 'Models', testId: 'sidebar-nav-models' },
    { to: '/settings', icon: <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />, label: 'Settings', testId: 'sidebar-nav-settings' },
  ];

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border',
        'bg-[#eae8e1] dark:bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Top Header Toggle */}
      <div className={cn('flex items-center p-2 h-12', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-1.5 px-1.5 overflow-hidden">
            <BrandIcon size={17} variant="tray" className="shrink-0 text-foreground/85" />
            <span className="text-[13px] font-semibold truncate whitespace-nowrap text-foreground/85">
              Sarah
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 rounded-[7px]"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-[17px] w-[17px]" strokeWidth={2} />
          ) : (
            <PanelLeftClose className="h-[17px] w-[17px]" strokeWidth={2} />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col px-2 gap-0.5">
        <button
          data-testid="sidebar-new-chat"
          onClick={async () => {
            await newSession();
            navigate('/');
          }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors mb-2',
            'bg-black/5 dark:bg-accent shadow-none border border-transparent text-foreground',
            sidebarCollapsed && 'justify-center px-0',
          )}
        >
          <div className="flex shrink-0 items-center justify-center text-foreground/80">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">New Chat</span>}
        </button>

        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={sidebarCollapsed}
          />
        ))}
      </nav>

      {!sidebarCollapsed && (
        <div className="mt-4 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
          <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Current Session
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className={cn(
              'mb-3 w-full rounded-lg border p-3 text-left transition-colors',
              'hover:bg-black/[0.05]',
              location.pathname === '/' ? 'border-primary/20 bg-black/5 dark:bg-white/5' : 'border-border/60 bg-card/40',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">Today</span>
              {hydrated && userTurns > 0 && (
                <Badge variant="secondary" className="shrink-0">
                  {userTurns} turn{userTurns === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {currentPreview}
            </p>
          </button>

          <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent History
          </div>

          <div className="space-y-1">
            {recentHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
                Historical summaries will appear here after consolidation runs.
              </div>
            ) : (
              recentHistory.map((summary) => (
                <button
                  key={summary.date}
                  type="button"
                  onClick={() => navigate('/sessions')}
                  className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/[0.05]"
                >
                  <div className="truncate text-sm font-medium text-foreground">
                    {summary.date}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {summary.summary}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-2 mt-auto">
        <NavLink
          to="/settings"
          data-testid="sidebar-nav-settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
              'hover:bg-black/[0.05] text-foreground/80',
              isActive && 'bg-black/[0.05] text-foreground',
              sidebarCollapsed ? 'justify-center px-0' : ''
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn('flex shrink-0 items-center justify-center', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">Settings</span>}
            </>
          )}
        </NavLink>

        <NavLink
          to="/workspace"
          data-testid="sidebar-open-workspace"
          className={({ isActive }) =>
            cn(
              'mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
              'hover:bg-black/[0.05] text-foreground/80',
              isActive && 'bg-black/[0.05] text-foreground',
              sidebarCollapsed ? 'justify-center px-0' : '',
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn('flex shrink-0 items-center justify-center', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                <ExternalLink className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && (
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  OpenClaw Workspace
                </span>
              )}
            </>
          )}
        </NavLink>
      </div>
    </aside>
  );
}
