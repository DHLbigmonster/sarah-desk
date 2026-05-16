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
import type { LocalToolApprovalScope } from '../../../../shared/types/local-tools';
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

interface TimelineItem {
  id: string;
  label: string;
  toolName?: string;
  at: number;
}

export function AgentWindow(): ReactNode {
  const [context, setContext] = useState<AgentContext | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);
  const [progressText, setProgressText] = useState('正在思考…');
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [feishuSaveState, setFeishuSaveState] = useState<'idle' | 'confirm' | 'saving' | 'saved' | 'error'>('idle');

  const streamingIdRef = useRef<string | null>(null);
  const firstChunkNotifiedRef = useRef(false);
  const answerBodyRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const followUpInputRef = useRef<HTMLTextAreaElement | null>(null);

  const syncVisibleAnswer = useCallback((assistantMessage: AgentMessage | null) => {
    return assistantMessage?.content ?? '';
  }, []);

  const pushTimeline = useCallback((item: Omit<TimelineItem, 'id' | 'at'>) => {
    setTimeline((prev) => {
      const next = [
        ...prev,
        {
          ...item,
          id: crypto.randomUUID(),
          at: Date.now(),
        },
      ];
      return next.slice(-7);
    });
  }, []);

  const handleHide = useCallback(() => {
    void window.api.agent.hide();
  }, []);

  const handleCopy = useCallback((text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const latestUser = findLatestMessage(messages, 'user');
  const latestAssistant = findLatestMessage(messages, 'assistant');
  const visibleAnswer = syncVisibleAnswer(latestAssistant);
  const showCursor = isStreaming;
  const showThinking = !visibleAnswer && isStreaming;

  const handleSaveToFeishu = useCallback(async () => {
    if (!context || isStreaming || feishuSaveState === 'saving') return;
    const capabilityId = 'visible-context.create-doc';
    const scope: LocalToolApprovalScope = 'one_time';

    if (feishuSaveState !== 'confirm') {
      await window.api.localTools.setApproval('lark-cli', capabilityId, scope);
      setFeishuSaveState('confirm');
      pushTimeline({ label: '再次点击确认写入飞书', toolName: 'Feishu' });
      return;
    }

    setFeishuSaveState('saving');
    pushTimeline({ label: '正在创建飞书文档', toolName: 'Feishu' });
    const result = await window.api.localTools.execute({
      toolId: 'lark-cli',
      capabilityId,
      args: {
        appName: context.appName,
        windowTitle: context.windowTitle,
        url: context.url ?? '',
        ocrText: context.ocrText ?? '',
        question: latestUser?.content ?? '',
        answer: visibleAnswer,
      },
    });
    if (result.success) {
      setFeishuSaveState('saved');
      pushTimeline({ label: result.output ?? '已创建飞书文档', toolName: 'Feishu' });
      return;
    }
    setFeishuSaveState('error');
    pushTimeline({ label: result.error ?? '飞书写入失败', toolName: 'Feishu' });
  }, [context, feishuSaveState, isStreaming, latestUser?.content, pushTimeline, visibleAnswer]);

  const handleAbort = useCallback(() => {
    void window.api.agent.abort();
    setIsStreaming(false);
    setProgressText('已停止');
    streamingIdRef.current = null;
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
    setProgressText('正在思考…');
    setTimeline([]);
    streamingIdRef.current = assistantMsg.id;
    firstChunkNotifiedRef.current = false;
  }, [messages, context]);

  const submitFollowUp = useCallback(() => {
    const instruction = followUpText.trim();
    if (!instruction || !context || isStreaming) return;

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: instruction,
      timestamp: Date.now(),
    };
    const assistantMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    void window.api.agent.sendInstruction(instruction, context);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setCopied(false);
    setProgressText('正在思考…');
    setTimeline([]);
    setFollowUpText('');
    setFollowUpOpen(false);
    streamingIdRef.current = assistantMsg.id;
    firstChunkNotifiedRef.current = false;
  }, [context, followUpText, isStreaming]);

  const openFollowUp = useCallback(() => {
    setFollowUpOpen(true);
    requestAnimationFrame(() => followUpInputRef.current?.focus());
  }, []);

  const toggleFollowUpRecording = useCallback(async () => {
    if (isStreaming) return;
    if (isRecordingFollowUp) {
      await window.api.asr.stop();
      setIsRecordingFollowUp(false);
      return;
    }

    try {
      setFollowUpOpen(true);
      await window.api.asr.start();
      setIsRecordingFollowUp(true);
    } catch {
      setIsRecordingFollowUp(false);
    }
  }, [isRecordingFollowUp, isStreaming]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleHide();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        const selectedText = window.getSelection()?.toString();
        if (!selectedText && visibleAnswer) {
          event.preventDefault();
          handleCopy(visibleAnswer);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHide, handleCopy, visibleAnswer]);

  useEffect(() => {
    const unsubShow = window.api.agent.onShow((payload) => {
      setMessages([]);
      setContext(payload.context);
      setIsStreaming(false);
      setCopied(false);
      setFollowUpOpen(false);
      setFollowUpText('');
      setIsRecordingFollowUp(false);
      setProgressText('正在思考…');
      setTimeline([]);
      setFeishuSaveState('idle');
      if (streamingIdRef.current) {
        streamingIdRef.current = null;
      }
      firstChunkNotifiedRef.current = false;
    });

    const unsubChunk = window.api.agent.onStreamChunk((chunk) => {
      if (!streamingIdRef.current) return;
      if (chunk.type === 'tool_use') {
        const label = chunk.text || (chunk.toolName ? `正在使用 ${chunk.toolName}` : '正在调用工具…');
        setProgressText(label);
        pushTimeline({ label, toolName: chunk.toolName });
        return;
      }
      if (!chunk.text) return;
      const activeId = streamingIdRef.current;
      if (!firstChunkNotifiedRef.current) {
        firstChunkNotifiedRef.current = true;
        window.api.agent.notifyFirstChunkVisible();
      }
      setProgressText('正在输出…');
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
      setProgressText('就绪');
      pushTimeline({ label: '完成', toolName: 'Sarah' });
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
      setProgressText('出错');
      pushTimeline({ label: error, toolName: 'Error' });
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
      setFollowUpOpen(false);
      setFollowUpText('');
      setIsRecordingFollowUp(false);
      setProgressText('正在思考…');
      setTimeline([]);
      setFeishuSaveState('idle');
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
      setFollowUpOpen(false);
      setFollowUpText('');
      setIsRecordingFollowUp(false);
      setProgressText('就绪');
      setTimeline(payload.isError ? [{ id: crypto.randomUUID(), label: payload.result, toolName: 'Error', at: Date.now() }] : []);
      setFeishuSaveState('idle');
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
  }, [pushTimeline]);

  useEffect(() => {
    const unsubscribe = window.api.asr.onResult((result) => {
      if (!isRecordingFollowUp || !result.isFinal || !result.text.trim()) return;
      setFollowUpText((prev) => {
        const separator = prev.trim() ? ' ' : '';
        return `${prev}${separator}${result.text.trim()}`;
      });
      void window.api.asr.stop();
      setIsRecordingFollowUp(false);
      setFollowUpOpen(true);
      requestAnimationFrame(() => followUpInputRef.current?.focus());
    });

    return unsubscribe;
  }, [isRecordingFollowUp]);

  // Auto-scroll during streaming, unless user has manually scrolled up
  useEffect(() => {
    if (!isStreaming) return;
    const body = answerBodyRef.current;
    if (!body) return;
    if (!userScrolledRef.current) {
      body.scrollTop = body.scrollHeight;
    }
  }, [visibleAnswer, isStreaming]);

  // Track whether user has scrolled up manually
  useEffect(() => {
    const body = answerBodyRef.current;
    if (!body) return;
    const handleScroll = (): void => {
      if (!isStreaming) return;
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
      userScrolledRef.current = !atBottom;
      setShowScrollBtn(!atBottom && isStreaming);
    };
    body.addEventListener('scroll', handleScroll, { passive: true });
    return () => body.removeEventListener('scroll', handleScroll);
  }, [isStreaming]);

  // Reset scroll tracking when a new streaming starts
  useEffect(() => {
    if (isStreaming) {
      userScrolledRef.current = false;
      setShowScrollBtn(false);
    }
  }, [isStreaming]);

  const statusState = isStreaming ? 'thinking' : 'done';
  const statusLabel = isStreaming ? progressText : '就绪';
  const overlayMode = context?.appName === 'Voice Query' ? 'Quick Ask' : 'Command';
  const progressLabel = isStreaming
    ? statusLabel
    : visibleAnswer
      ? 'Answer ready'
      : 'Waiting for instruction';

  return (
    <div className="agent-window">
      <div className="agent-window__header">
        <div className="agent-window__mode">
          <span className="agent-window__mode-mark" />
          <span>{latestUser ? 'Sarah 回答' : 'Sarah'}</span>
        </div>
        <button
          className="agent-window__close"
          onClick={handleHide}
          title="关闭 (Esc)"
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      <div className="agent-window__context">
        <ContextBar context={context} />
      </div>

      <div className="agent-window__progress-rail" data-state={statusState}>
        <span className="agent-window__progress-mode">{overlayMode}</span>
        <span className="agent-window__progress-line" />
        <span className="agent-window__progress-label">{progressLabel}</span>
      </div>

      {timeline.length > 0 && (
        <div className="agent-window__timeline" aria-label="执行进度">
          {timeline.map((item, index) => (
            <div className="agent-window__timeline-item" key={item.id} data-active={index === timeline.length - 1 && isStreaming}>
              <span className="agent-window__timeline-dot" />
              <span className="agent-window__timeline-tool">{item.toolName ?? 'Sarah'}</span>
              <span className="agent-window__timeline-label">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {latestUser?.content && (
        <div className="agent-window__question-shell">
          <div className="agent-window__question-label">你刚才说</div>
          <div className="agent-window__question">
            {latestUser.content}
          </div>
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
        </div>

        <div className="agent-window__answer-body" ref={answerBodyRef} aria-live="polite" aria-atomic="false">
          {showThinking ? (
            <ThinkingState label={progressText} />
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
          {showScrollBtn && (
            <button
              className="agent-window__scroll-bottom"
              onClick={() => {
                const body = answerBodyRef.current;
                if (body) body.scrollTop = body.scrollHeight;
                userScrolledRef.current = false;
                setShowScrollBtn(false);
              }}
              type="button"
              aria-label="回到底部"
            >
              ↓ 最新
            </button>
          )}
        </div>
      </div>

      <div className="agent-window__actionbar">
        {isStreaming ? (
          <button className="agent-window__action-btn agent-window__action-btn--danger" onClick={handleAbort}>
            停止
          </button>
        ) : (
          <button className="agent-window__action-btn agent-window__action-btn--primary" onClick={openFollowUp} disabled={!context}>
            继续追问
          </button>
        )}
        <button
          className="agent-window__action-btn"
          onClick={() => handleCopy(visibleAnswer)}
          disabled={!visibleAnswer}
          data-copied={copied}
        >
          {copied ? '已复制' : '复制'}
        </button>
        <button
          className="agent-window__action-btn agent-window__action-btn--feishu"
          onClick={handleSaveToFeishu}
          disabled={!context || isStreaming || feishuSaveState === 'saving'}
          data-state={feishuSaveState}
          title="用当前捕获的 App、URL、OCR 和回答创建飞书文档"
        >
          {feishuSaveState === 'confirm'
            ? '确认飞书'
            : feishuSaveState === 'saving'
              ? '写入中'
              : feishuSaveState === 'saved'
                ? '已存飞书'
                : feishuSaveState === 'error'
                  ? '重试飞书'
                  : '存飞书'}
        </button>
        <button className="agent-window__action-btn" onClick={handleRetry} disabled={!latestUser || !context || isStreaming}>
          重试
        </button>
        <button className="agent-window__action-btn" onClick={handleHide}>
          完成
        </button>
      </div>

      {followUpOpen && (
        <div className="agent-window__followup" role="form" aria-label="继续追问">
          <div className="agent-window__followup-topline">
            <span>继续追问</span>
            <span>Enter 发送 · Esc 关闭输入框</span>
          </div>
          <div className="agent-window__followup-row">
            <textarea
              ref={followUpInputRef}
              className="agent-window__followup-input"
              value={followUpText}
              onChange={(event) => setFollowUpText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitFollowUp();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setFollowUpOpen(false);
                }
              }}
              placeholder="直接补充一句，比如：新建文档，标题用今天的日期。"
              rows={2}
              disabled={isStreaming}
            />
            <button
              className="agent-window__followup-mic"
              onClick={toggleFollowUpRecording}
              type="button"
              disabled={isStreaming}
              data-recording={isRecordingFollowUp}
              aria-label={isRecordingFollowUp ? '停止语音追问' : '语音追问'}
              title={isRecordingFollowUp ? '停止语音追问' : '语音追问'}
            >
              {isRecordingFollowUp ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>
            <button
              className="agent-window__followup-send"
              onClick={submitFollowUp}
              type="button"
              disabled={!followUpText.trim() || isStreaming}
              aria-label="发送追问"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </div>
          <div className="agent-window__followup-hint">
            这是当前答案的追问。你设置的 Command 快捷键更适合从前台 App 发起新任务。
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingState({ label }: { label: string }): ReactNode {
  return (
    <div className="agent-window__thinking">
      <span className="agent-window__thinking-dot" />
      <span className="agent-window__thinking-dot" />
      <span className="agent-window__thinking-dot" />
      <span className="agent-window__thinking-text">{label}</span>
    </div>
  );
}
