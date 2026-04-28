// Phase 2: real chat page wired to the main-process agent service via
// window.api.agent.{sendInstruction, onStreamChunk, onStreamDone, onStreamError}.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, Plus, Mic, MicOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { useChatStore, installChatStreamBridge } from '../stores/chat';

export function Chat() {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const hydrated = useChatStore((s) => s.hydrated);
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);
  const newSession = useChatStore((s) => s.newSession);
  const hydrate = useChatStore((s) => s.hydrate);
  const consumeQueuedPrompt = useChatStore((s) => s.consumeQueuedPrompt);

  const [input, setInput] = useState('');
  const [voiceRecording, setVoiceRecording] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void hydrate();
    const teardown = installChatStreamBridge();
    return teardown;
  }, [hydrate]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const queued = consumeQueuedPrompt();
    if (!queued) return;

    if (queued.autoSend) {
      void send(queued.text);
      setInput('');
      return;
    }

    setInput(queued.text);
  }, [consumeQueuedPrompt, send]);

  const busy = status === 'thinking' || status === 'streaming';
  const isEmpty = messages.length === 0;

  const statusLabel = useMemo(() => {
    if (status === 'thinking') return 'Thinking…';
    if (status === 'streaming') return 'Streaming…';
    if (status === 'error' && error) return `Error: ${error}`;
    return null;
  }, [status, error]);

  const onSubmit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await send(text);
  };

  const toggleVoice = async () => {
    if (voiceRecording) {
      setVoiceRecording(false);
      const result = await window.api.clawDesk.voiceInputStop();
      const { text } = result;
      if (text) setInput((prev) => (prev ? prev + ' ' + text : text));
    } else {
      const result = await window.api.clawDesk.voiceInputToggle();
      if ('recording' in result && result.recording) {
        setVoiceRecording(true);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Driven by the local OpenClaw agent (openclaw agent --agent main --json).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void newSession()}
          disabled={!hydrated || isEmpty}
        >
          <Plus className="mr-1 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card/40 p-4"
      >
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                streaming={!!m.isStreaming}
              />
            ))}
          </div>
        )}
      </div>

      {statusLabel && (
        <div
          className={cn(
            'mt-2 text-xs',
            status === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {statusLabel}
        </div>
      )}

      <div className="mt-3 rounded-lg border bg-background shadow-sm">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onSubmit();
            }
          }}
          placeholder="Ask anything — Enter to send, Shift+Enter for newline"
          rows={3}
          className="w-full resize-none rounded-lg bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center justify-between border-t px-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={voiceRecording ? 'destructive' : 'ghost'}
              onClick={() => void toggleVoice()}
              disabled={busy}
            >
              {voiceRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </Button>
            <span className="text-xs text-muted-foreground">
              {voiceRecording ? 'Recording…' : busy ? 'Agent is running…' : 'Ready'}
            </span>
          </div>
          {busy ? (
            <Button size="sm" variant="destructive" onClick={() => void abort()}>
              <Square className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => void onSubmit()} disabled={!input.trim()}>
              <Send className="mr-1 h-3.5 w-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h2 className="text-2xl font-semibold text-foreground">Welcome to Sarah</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Type a message below to talk to your local OpenClaw agent. Voice mode hotkeys
        (Right Ctrl / +Shift / +Space) still work independently.
      </p>
    </div>
  );
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  streaming: boolean;
}

function MessageBubble({ role, content, streaming }: MessageBubbleProps) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {content || (streaming ? <TypingDots /> : '')}
        {streaming && content && <span className="ml-0.5 animate-pulse">▋</span>}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/60" />
    </span>
  );
}
