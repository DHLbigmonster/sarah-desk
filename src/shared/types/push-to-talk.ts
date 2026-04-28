export type VoiceOverlayMode = 'idle' | 'dictation' | 'command' | 'quickask';

export type VoiceOverlayPhase =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'routing'
  | 'executing'
  | 'done'
  | 'error';

export interface VoiceOverlayState {
  mode: VoiceOverlayMode;
  phase: VoiceOverlayPhase;
}
