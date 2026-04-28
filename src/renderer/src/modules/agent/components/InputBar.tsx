/**
 * InputBar Component.
 * Bottom bar of the agent window: text input + send/abort button + mic button.
 *
 * Keyboard shortcuts:
 *   Enter         – submit instruction
 *   Shift+Enter   – insert newline
 *   Escape        – abort running task (when streaming)
 *
 * Voice input:
 *   Click mic → starts Volcengine ASR session via window.api.asr.
 *   On final transcript, text is appended to the textarea.
 *   Requires VOLCENGINE_APP_ID + VOLCENGINE_ACCESS_TOKEN in .env.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isStreaming: boolean;
  /** Text from external STT to append to the input (e.g. from agent STT_RESULT) */
  pendingSttText?: string;
}

export function InputBar({
  onSubmit,
  onAbort,
  disabled,
  isStreaming,
  pendingSttText,
}: InputBarProps): ReactNode {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Append STT text when it arrives (from agent STT_RESULT IPC channel)
  useEffect(() => {
    if (pendingSttText) {
      setValue((prev) => prev + pendingSttText);
      textareaRef.current?.focus();
    }
  }, [pendingSttText]);

  // Subscribe to ASR results while recording in agent mode
  useEffect(() => {
    if (!isRecording) return;

    const unsub = window.api.asr.onResult((result) => {
      if (result.isFinal && result.text) {
        setValue((prev) => (prev ? prev + ' ' + result.text : result.text));
        textareaRef.current?.focus();
        // Auto-stop after final result
        void window.api.asr.stop();
        setIsRecording(false);
      }
    });

    return unsub;
  }, [isRecording]);

  // Auto-resize textarea height
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = value.trim();
        if (text && !disabled) {
          onSubmit(text);
          setValue('');
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
      }
      if (e.key === 'Escape' && isStreaming) {
        onAbort();
      }
    },
    [value, disabled, isStreaming, onSubmit, onAbort],
  );

  const handleSubmitClick = useCallback(() => {
    const text = value.trim();
    if (text && !disabled) {
      onSubmit(text);
      setValue('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSubmit]);

  const handleMicClick = useCallback(async () => {
    if (isRecording) {
      await window.api.asr.stop();
      setIsRecording(false);
    } else {
      try {
        await window.api.asr.start();
        setIsRecording(true);
      } catch {
        setIsRecording(false);
      }
    }
  }, [isRecording]);

  return (
    <div className="input-bar">
      <textarea
        ref={textareaRef}
        className="input-bar__textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="输入指令… (Enter 发送，Shift+Enter 换行)"
        rows={1}
        spellCheck={false}
      />
      <div className="input-bar__actions">
        {/* Mic button for voice input (Volcengine ASR) */}
        <button
          className={`input-bar__btn input-bar__btn--mic${isRecording ? ' input-bar__btn--mic-active' : ''}`}
          onClick={handleMicClick}
          title={isRecording ? '停止录音' : '语音输入 (需配置 .env 中的 VOLCENGINE_ACCESS_TOKEN)'}
          disabled={isStreaming}
        >
          {isRecording ? '⏹' : '🎙'}
        </button>

        {/* Send / abort button */}
        {isStreaming ? (
          <button
            className="input-bar__btn input-bar__btn--abort"
            onClick={onAbort}
            title="中止 (Esc)"
          >
            ■
          </button>
        ) : (
          <button
            className="input-bar__btn input-bar__btn--send"
            onClick={handleSubmitClick}
            disabled={!value.trim() || disabled}
            title="发送 (Enter)"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
