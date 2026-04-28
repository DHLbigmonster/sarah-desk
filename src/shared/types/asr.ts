/**
 * ASR (Automatic Speech Recognition) type definitions.
 * Used by both main process and renderer process.
 */

/**
 * ASR configuration for Volcengine service.
 */
export interface ASRConfig {
  appId: string;
  accessToken: string;
  resourceId: string; // "volc.bigasr.sauc.duration"
}

/**
 * ASR result from speech recognition.
 */
export interface ASRResult {
  type: 'interim' | 'final';
  text: string;
  isFinal: boolean;
}

/**
 * Unified voice-pipeline status (design-doc Section 7 state machine):
 *
 *   idle → connecting → listening → processing → routing → executing → done
 *                           ↓                                           ↑
 *                         error ──────────────────────────────────────►┘
 *
 * - idle:       Waiting for hotkey
 * - connecting: Establishing STT provider connection
 * - listening:  Recording audio from microphone
 * - processing: Audio sent, waiting for STT result
 * - routing:    STT done, dispatching to the active mode handler (dictation / command / quick ask)
 * - executing:  Running the active mode action (text insert, agent call, answer overlay)
 * - done:       Action complete; UI shows brief confirmation
 * - error:      Something went wrong at any stage
 */
export type ASRStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'routing'
  | 'executing'
  | 'done'
  | 'error';

/**
 * Audio chunk data (PCM format).
 */
export interface AudioChunk {
  data: Int16Array;
  sampleRate: 16000;
  channels: 1;
}
