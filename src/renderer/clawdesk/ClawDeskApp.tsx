/**
 * @deprecated Legacy ClawDesk desktop shell.
 *
 * Product direction has moved to Sarah Mini:
 * menubar-first, hotkey-first, voice-first. This route tree remains only as a
 * temporary fallback / debug UI and should not receive major new product work.
 */
import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { MainLayout } from './components/layout/MainLayout';
import { Chat } from './pages/Chat';
import { Models } from './pages/Models';
import { Agents } from './pages/Agents';
import { Channels } from './pages/Channels';
import { Skills } from './pages/Skills';
import { Cron } from './pages/Cron';
import { Sessions } from './pages/Sessions';
import { Settings } from './pages/Settings';
import { Workspace } from './pages/Workspace';
import { useUiStore } from './stores/ui';
import './styles.css';

export function ClawDeskApp() {
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  useEffect(() => {
    // When ClawDesk opens directly at `clawdesk.html` there may be no hash yet.
    // Normalize the initial location so the route tree always has a concrete match.
    if (!window.location.hash) {
      window.location.replace(`${window.location.pathname}${window.location.search}#/`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTheme = async (): Promise<void> => {
      try {
        const nextTheme = await window.api.clawDesk.getThemeMode();
        if (!cancelled) {
          setThemeMode(nextTheme);
        }
      } catch {
        if (!cancelled) {
          setThemeMode('system');
        }
      }
    };

    void loadTheme();
    return () => {
      cancelled = true;
    };
  }, [setThemeMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (): void => {
      const resolvedTheme =
        themeMode === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    };

    applyTheme();
    const listener = (): void => applyTheme();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themeMode]);

  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Chat />} />
          <Route path="models" element={<Models />} />
          <Route path="agents" element={<Agents />} />
          <Route path="channels" element={<Channels />} />
          <Route path="skills" element={<Skills />} />
          <Route path="cron" element={<Cron />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="settings" element={<Settings />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" richColors closeButton />
    </HashRouter>
  );
}

export default ClawDeskApp;
