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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentContext, AgentMessage } from '../../../../shared/types/agent';
import { ContextBar } from './components/ContextBar';

function CodeBlockCopyButton({ code }: { code: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);
  return (
    <button
      className="agent-window__code-copy-btn"
      onClick={handleCopy}
      title="复制代码"
      aria-label="复制代码"
      data-copied={copied}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

/** Extract plain text from ReactMarkdown code children for clipboard. */
function extractCodeText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map(extractCodeText).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return extractCodeText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

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
  const [copied, setCopied] = useState(false);

  const streamingIdRef = useRef<string | null>(null);
  const firstChunkNotifiedRef = useRef(false);

  const syncVisibleAnswer = useCallback((assistantMessage: AgentMessage | null) => {
    return assistantMessage?.content ?? '';
  }, []);

  const handleHide = useCallback(() => {
    void window.api.agent.hide();
  }, []);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleRetry = useCallback(() => {
    const userMsg = findLatestMessage(messages, 'user');
    if (!userMsg || !context) return;
    void window.api.agent.sendInstruction(userMsg.content, context);
    const assistantMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages([userMsg, assistantMsg]);
    setIsStreaming(true);
    setCopied(false);
    streamingIdRef.current = assistantMsg.id;
    firstChunkNotifiedRef.current = false;
  }, [messages, context]);

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
      setCopied(false);
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
      setCopied(false);
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
      setCopied(false);
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

  const statusState = isStreaming ? 'thinking' : 'done';
  const statusLabel = isStreaming ? '正在思考' : '已完成';

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

      {latestUser?.content && (
        <div className="agent-window__question-shell">
          <div className="agent-window__question">
            {latestUser.content}
          </div>
          {!isStreaming && (
            <button
              className="agent-window__retry-btn"
              onClick={handleRetry}
              title="重新提问"
              aria-label="重新提问"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              重试
            </button>
          )}
        </div>
      )}

      <div className="agent-window__answer-shell">
        <div className="agent-window__answer-header">
          <div
            className="agent-window__answer-status"
            data-state={statusState}
          >
            {statusLabel}
          </div>
          {visibleAnswer && !isStreaming && (
            <button
              className="agent-window__copy-btn"
              onClick={() => handleCopy(visibleAnswer)}
              title="复制回答"
              aria-label="复制回答"
              data-copied={copied}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
        </div>

        <div className="agent-window__answer-body">
          {showThinking ? (
            <ThinkingState />
          ) : (
            <div className="agent-window__answer-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children, ...props }) => {
                    const codeText = extractCodeText(children);
                    return (
                      <div className="agent-window__code-block-wrapper">
                        <pre className="agent-window__code-block" {...props}>{children}</pre>
                        {codeText && <CodeBlockCopyButton code={codeText} />}
                      </div>
                    );
                  },
                  code: ({ className, children, ...props }) => (
                    <code className={`agent-window__code${className ? ` ${className}` : ''}`} {...props}>{children}</code>
                  ),
                }}
              >
                {visibleAnswer}
              </ReactMarkdown>
              {showCursor && <span className="agent-window__cursor" aria-hidden="true" />}
            </div>
          )}
        </div>
      </div>

      <div className="agent-window__footer">
        <span>
          快捷提问 <kbd>⌃</kbd> / <kbd>⌃</kbd><kbd>Space</kbd>
        </span>
        <span>
          命令 <kbd>⌃</kbd><kbd>⇧</kbd>
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
      <span className="agent-window__thinking-text">正在思考…</span>
    </div>
  );
}
