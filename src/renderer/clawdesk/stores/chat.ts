// Phase 2 chat store — wires clawdesk Chat page to the main-process agent service.
// Persistence piggybacks on memoryService's per-day session via window.api.agent.*.

import { create } from 'zustand';
import type { AgentContext, AgentMessage } from '../../../shared/types/agent';

type Status = 'idle' | 'thinking' | 'streaming' | 'error';

interface ChatState {
  messages: AgentMessage[];
  status: Status;
  error: string | null;
  streamingId: string | null;
  hydrated: boolean;
  queuedPrompt: { text: string; autoSend: boolean } | null;

  hydrate: () => Promise<void>;
  send: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  newSession: () => Promise<void>;
  queuePrompt: (text: string, autoSend?: boolean) => void;
  consumeQueuedPrompt: () => { text: string; autoSend: boolean } | null;

  _pushUser: (text: string) => AgentMessage;
  _startAssistant: () => AgentMessage;
  _appendChunk: (text: string) => void;
  _finishAssistant: () => void;
  _setError: (msg: string) => void;
  _persist: () => void;
}

const DESKTOP_CONTEXT: AgentContext = {
  appName: 'Sarah',
  windowTitle: 'Sarah Chat',
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  error: null,
  streamingId: null,
  hydrated: false,
  queuedPrompt: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const session = await window.api.agent.getTodaySession();
      set({
        messages: session?.messages ?? [],
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (get().status === 'thinking' || get().status === 'streaming') return;

    get()._pushUser(trimmed);
    get()._startAssistant();
    set({ status: 'thinking', error: null });
    get()._persist();

    try {
      await window.api.agent.sendInstruction(trimmed, DESKTOP_CONTEXT);
    } catch (err) {
      get()._setError(err instanceof Error ? err.message : 'Failed to send instruction');
    }
  },

  abort: async () => {
    try {
      await window.api.agent.abort();
    } catch {
      /* ignore */
    }
    get()._finishAssistant();
    set({ status: 'idle' });
  },

  newSession: async () => {
    await get().abort();
    set({ messages: [], error: null, status: 'idle', streamingId: null });
    try {
      await window.api.agent.saveSession([]);
    } catch {
      /* ignore */
    }
  },

  queuePrompt: (text, autoSend = false) => {
    set({ queuedPrompt: { text, autoSend } });
  },

  consumeQueuedPrompt: () => {
    const current = get().queuedPrompt;
    if (current) {
      set({ queuedPrompt: null });
    }
    return current;
  },

  _pushUser: (text) => {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  _startAssistant: () => {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    set((s) => ({ messages: [...s.messages, msg], streamingId: msg.id }));
    return msg;
  },

  _appendChunk: (text) => {
    set((s) => {
      if (!s.streamingId) return s;
      return {
        messages: s.messages.map((m) =>
          m.id === s.streamingId ? { ...m, content: m.content + text } : m,
        ),
        status: 'streaming',
      };
    });
  },

  _finishAssistant: () => {
    set((s) => {
      if (!s.streamingId) return { status: 'idle' };
      return {
        streamingId: null,
        status: 'idle',
        messages: s.messages.map((m) =>
          m.id === s.streamingId ? { ...m, isStreaming: false } : m,
        ),
      };
    });
    get()._persist();
  },

  _setError: (msg) => {
    set((s) => {
      if (!s.streamingId) return { status: 'error', error: msg };
      return {
        status: 'error',
        error: msg,
        streamingId: null,
        messages: s.messages.map((m) =>
          m.id === s.streamingId
            ? { ...m, isStreaming: false, content: m.content || `⚠ ${msg}` }
            : m,
        ),
      };
    });
    get()._persist();
  },

  _persist: () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const msgs = get().messages.filter((m) => !m.isStreaming);
      void window.api.agent.saveSession(msgs).catch(() => { /* ignore */ });
    }, 400);
  },
}));

export function installChatStreamBridge(): () => void {
  const offChunk = window.api.agent.onStreamChunk((chunk) => {
    if (chunk.type === 'text' && chunk.text) {
      useChatStore.getState()._appendChunk(chunk.text);
    } else if (chunk.type === 'error' && chunk.error) {
      useChatStore.getState()._setError(chunk.error);
    }
  });
  const offDone = window.api.agent.onStreamDone(() => {
    useChatStore.getState()._finishAssistant();
  });
  const offError = window.api.agent.onStreamError((msg) => {
    useChatStore.getState()._setError(msg);
  });
  return () => {
    offChunk();
    offDone();
    offError();
  };
}
