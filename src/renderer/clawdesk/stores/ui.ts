// Phase 1 skeleton — not wired to business logic.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClawDeskThemeMode } from '../../../shared/types/clawdesk-settings';

interface UiState {
  sidebarCollapsed: boolean;
  themeMode: ClawDeskThemeMode;
  setSidebarCollapsed: (v: boolean) => void;
  setThemeMode: (themeMode: ClawDeskThemeMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      themeMode: 'system',
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: 'clawdesk-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
