/**
 * Answer overlay for Quick Ask / Command.
 * Lightweight temporary response surface:
 * - centered
 * - no bottom input bar
 * - renders only the latest turn instead of a full chat transcript
 * - ESC hides immediately
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AgentContext, AgentMessage } from '../../../../shared/types/agent';
import { ContextBar } from './components/ContextBar';

function findLatestMessage(messages: AgentMessage[], role: AgentMessage['role']): AgentMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index];
    }
  }
  return null;
}

export function AgentWindow(): ReactNode {
  const [context, setContext] = useState<AgentContext | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const streamingIdRef = useRef<string | null>(null);
  const firstChunkNotifiedRef = useRef(false);

  const syncVisibleAnswer = useCallback((assistantMessage: AgentMessage | null) => {
    // Directly show full content without animation
    return assistantMessage?.content ?? '';
  }, []);

  const handleHide = useCallback(() => {
    void window.api.agent.hide();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleHide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHide]);

  useEffect(() => {
    const unsubShow = window.api.agent.onShow((payload) => {
      setMessages([]);
      setContext(payload.context);
      setIsStreaming(false);
      if (streamingIdRef.current) {
        streamingIdRef.current = null;
      }
      firstChunkNotifiedRef.current = false;
    });

    const unsubChunk = window.api.agent.onStreamChunk((chunk) => {
      if (!streamingIdRef.current || !chunk.text) return;
      const activeId = streamingIdRef.current;
      if (!firstChunkNotifiedRef.current) {
        firstChunkNotifiedRef.current = true;
        window.api.agent.notifyFirstChunkVisible();
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === activeId
            ? { ...message, content: message.content + chunk.text }
            : message,
        ),
      );
    });

    const unsubDone = window.api.agent.onStreamDone(() => {
      setIsStreaming(false);
      if (!streamingIdRef.current) return;
      const activeId = streamingIdRef.current;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === activeId ? { ...message, isStreaming: false } : message,
        ),
      );
      streamingIdRef.current = null;
    });

    const unsubError = window.api.agent.onStreamError((error) => {
      setIsStreaming(false);
      if (!streamingIdRef.current) return;
      const activeId = streamingIdRef.current;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === activeId
            ? {
                ...message,
                content: message.content ? `${message.content}\n\n⚠️ ${error}` : `⚠️ ${error}`,
                isStreaming: false,
              }
            : message,
        ),
      );
      streamingIdRef.current = null;
    });

    const unsubExternalSubmit = window.api.agent.onExternalSubmit((payload) => {
      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: payload.instruction,
        timestamp: Date.now(),
      };

      const assistantMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setContext(payload.context);
      setIsStreaming(true);
      streamingIdRef.current = assistantMessage.id;
      firstChunkNotifiedRef.current = false;
      setMessages([userMessage, assistantMessage]);

      void window.api.agent.sendInstruction(payload.instruction, payload.context);
    });

    const unsubShowResult = window.api.agent.onShowResult((payload) => {
      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: payload.transcript,
        timestamp: Date.now(),
      };

      const assistantMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: payload.isError ? `⚠️ ${payload.result}` : payload.result,
        timestamp: Date.now(),
        isStreaming: false,
      };

      setContext(payload.context);
      setIsStreaming(false);
      streamingIdRef.current = null;
      firstChunkNotifiedRef.current = false;
      setMessages([userMessage, assistantMessage]);
    });

    return () => {
      unsubShow();
      unsubChunk();
      unsubDone();
      unsubError();
      unsubExternalSubmit();
      unsubShowResult();
    };
  }, []);

  const latestUser = findLatestMessage(messages, 'user');
  const latestAssistant = findLatestMessage(messages, 'assistant');
  const visibleAnswer = syncVisibleAnswer(latestAssistant);
  const showCursor = isStreaming;
  const showThinking = !visibleAnswer && isStreaming;

  const statusState = showThinking ? 'thinking' : isStreaming ? 'streaming' : 'done';
  const statusLabel = showThinking ? '正在生成' : isStreaming ? '正在输出' : '已完成';

  return (
    <div className="agent-window">
      <div className="agent-window__header">
        <button
          className="agent-window__close"
          onClick={handleHide}
          title="关闭 (Esc)"
          aria-label="关闭回答浮层"
        >
          ×
        </button>
      </div>

      <div className="agent-window__context">
        <ContextBar context={context} />
      </div>

      <div className="agent-window__question-shell">
        <div className="agent-window__question">
          {latestUser?.content ?? '等待新的语音问题…'}
        </div>
      </div>

      <div className="agent-window__answer-shell">
        <div className="agent-window__answer-header">
          <div
            className="agent-window__answer-status"
            data-state={statusState}
          >
            {statusLabel}
          </div>
        </div>

        <div className="agent-window__answer-body">
          {showThinking ? (
            <ThinkingState />
          ) : (
            <pre className="agent-window__answer-text">
              {visibleAnswer || ' '}
              {showCursor && <span className="agent-window__cursor" aria-hidden="true" />}
            </pre>
          )}
        </div>
      </div>

      <div className="agent-window__footer">
        <span>
          追问 <kbd>⌃</kbd> <kbd>Space</kbd>
        </span>
        <span>
          命令 <kbd>⌃</kbd> <kbd>Shift</kbd>
        </span>
        <span>
          关闭 <kbd>Esc</kbd>
        </span>
      </div>
    </div>
  );
}

function ThinkingState(): ReactNode {
  return (
    <div className="agent-window__thinking">
      <span className="agent-window__thinking-dot" />
      <span className="agent-window__thinking-dot" />
      <span className="agent-window__thinking-dot" />
      <span className="agent-window__thinking-text">正在等待 OpenClaw 返回内容…</span>
    </div>
  );
}
