// Phase 2: embed the local OpenClaw workspace via <webview>. URL is resolved
// from the main process (claw-desk:get-workspace-target), which reads the
// gateway port/token from ~/.openclaw/openclaw.json.

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'offline'; error: string };

export function Workspace() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [webviewLoading, setWebviewLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const webviewRef = useRef<HTMLElement | null>(null);

  const resolve = async () => {
    setState({ kind: 'loading' });
    try {
      const res = await window.api.clawDesk.getWorkspaceTarget();
      if (res.success && res.url) {
        setState({ kind: 'ready', url: res.url });
      } else {
        setState({ kind: 'offline', error: res.error ?? 'Unknown error' });
      }
    } catch (err) {
      setState({
        kind: 'offline',
        error: err instanceof Error ? err.message : 'Failed to reach main process',
      });
    }
  };

  useEffect(() => {
    void resolve();
  }, []);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const element = webviewRef.current as (HTMLElement & {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
    }) | null;
    if (!element) return;

    const handleStart = () => setWebviewLoading(true);
    const handleStop = () => setWebviewLoading(false);
    const handleFail = (event: Event) => {
      const errorEvent = event as Event & { errorDescription?: string };
      setWebviewLoading(false);
      setState({
        kind: 'offline',
        error: errorEvent.errorDescription || 'Workspace failed to load inside the desktop shell.',
      });
    };

    element.addEventListener('did-start-loading', handleStart);
    element.addEventListener('did-stop-loading', handleStop);
    element.addEventListener('did-fail-load', handleFail);

    return () => {
      element.removeEventListener('did-start-loading', handleStart);
      element.removeEventListener('did-stop-loading', handleStop);
      element.removeEventListener('did-fail-load', handleFail);
    };
  }, [state, reloadKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">OpenClaw Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Full gateway dashboard embedded inside the ClawDesk shell.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void resolve()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
          {state.kind === 'ready' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setReloadKey((current) => current + 1);
                setWebviewLoading(true);
              }}
              disabled={webviewLoading}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Reload View
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        {state.kind === 'loading' && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Resolving gateway URL…
          </div>
        )}

        {state.kind === 'offline' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <div className="font-medium text-foreground">OpenClaw gateway offline</div>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{state.error}</p>
            </div>
            <Button size="sm" onClick={() => void resolve()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="relative h-full w-full">
            {webviewLoading && (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 border-b bg-background/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading workspace…
              </div>
            )}
            <webview
              key={`${state.url}:${reloadKey}`}
              ref={(node) => {
                webviewRef.current = node;
              }}
              src={state.url}
              style={{ width: '100%', height: '100%', display: 'flex' }}
              allowpopups={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
