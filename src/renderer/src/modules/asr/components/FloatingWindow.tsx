/**
 * Floating Window Component.
 * Compact HUD that shows only the active mode and current phase.
 */

import type { ReactNode } from 'react';
import { useASRStatus, useAudioLevel } from '../hooks';
import { AudioWaveform } from './AudioWaveform';
import type { VoiceOverlayState } from '../../../../../shared/types/push-to-talk';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

function modeLabel(state: VoiceOverlayState): string {
  switch (state.mode) {
    case 'dictation':
      return state.phase === 'recording' ? 'Dictating' : 'Dictation';
    case 'command':
      return state.phase === 'recording' ? 'Command' : 'Sending';
    case 'quickask':
      return state.phase === 'recording' ? 'Quick Ask' : 'Asking';
    default:
      return 'Sarah';
  }
}

function phaseLabel(status: string, error?: string, notice?: string): string {
  if (error) return 'Error';
  if (notice) return notice;
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'listening':
      return 'Listening';
    case 'processing':
      return 'Processing';
    case 'routing':
      return 'Routing';
    case 'executing':
      return 'Executing';
    default:
      return 'Ready';
  }
}

export function FloatingWindow(): ReactNode {
  const { status, error, notice } = useASRStatus();
  const audioLevel = useAudioLevel();
  const [voiceState, setVoiceState] = useState<VoiceOverlayState>({ mode: 'idle', phase: 'idle' });

  useEffect(() => {
    return window.api.pushToTalk.onState((state) => {
      setVoiceState(state);
    });
  }, []);

  const isVisible = voiceState.mode !== 'idle' || status !== 'idle' || Boolean(error) || Boolean(notice);

  if (!isVisible) {
    return null;
  }

  const isRecording = voiceState.phase === 'recording' && (status === 'connecting' || status === 'listening');
  const tone = error ? 'error' : status === 'processing' || status === 'routing' || status === 'executing' ? 'busy' : 'default';
  const showActions = voiceState.mode !== 'idle';

  return (
    <div className="floating-window">
      <div className={`floating-window__content${error ? ' is-error' : ''}`}>
        {showActions ? (
          <button
            type="button"
            className="floating-window__action"
            aria-label="取消语音输入"
            onClick={() => window.api.pushToTalk.cancel()}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        ) : (
          <span className="floating-window__action floating-window__action--ghost" aria-hidden="true" />
        )}

        <div className="floating-window__wave">
          <AudioWaveform level={audioLevel} active={isRecording} tone={tone} />
        </div>

        <div className="floating-window__label" aria-live="polite">
          <span className="floating-window__mode">{modeLabel(voiceState)}</span>
          <span className="floating-window__phase">{phaseLabel(status, error ?? undefined, notice ?? undefined)}</span>
        </div>

        {showActions ? (
          <button
            type="button"
            className="floating-window__action floating-window__action--confirm"
            aria-label="确认并结束语音输入"
            onClick={() => window.api.pushToTalk.confirm()}
          >
            <Check size={15} strokeWidth={2.4} />
          </button>
        ) : (
          <span className="floating-window__action floating-window__action--ghost" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
