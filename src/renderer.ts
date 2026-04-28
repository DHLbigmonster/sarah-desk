/**
 * Main window renderer process.
 * Handles automatic audio recording when ASR status changes.
 */

import './index.css';
import { AudioRecorder } from './renderer/src/modules/asr';

console.log(
  '👋 This message is being logged by "renderer.ts", included via Vite',
);

window.api.mini.signalRecorderReady();
window.api.mini.onRecorderPing((nonce) => {
  window.api.mini.sendRecorderPong(nonce);
});

// Audio recorder instance
let recorder: AudioRecorder | null = null;

/**
 * Initialize audio recorder with callback to send chunks to main process.
 */
function initRecorder(): AudioRecorder {
  return new AudioRecorder(
    (chunk) => {
      // Send audio chunk to main process via IPC
      window.api.asr.sendAudio(chunk);
    },
    (state) => {
      console.log('[Renderer] AudioRecorder state:', state);
    },
    (level) => {
      window.api.floatingWindow.setAudioLevel(level);
    },
  );
}

/**
 * Start recording audio.
 */
async function startRecording(): Promise<void> {
  if (!recorder) {
    recorder = initRecorder();
  }

  const state = recorder.getState();
  if (state.isRecording || state.isStarting) {
    return;
  }

  try {
    console.log('[Renderer] Starting audio recording...');
    await recorder.start();
    console.log('[Renderer] Audio recording started');
  } catch (error) {
    console.error('[Renderer] Failed to start recording:', error);
  }
}

/**
 * Stop recording audio.
 */
function stopRecording(): void {
  if (!recorder) {
    return;
  }

  const state = recorder.getState();
  if (!state.isRecording && !state.isStarting) {
    return;
  }

  console.log('[Renderer] Stopping audio recording...');
  recorder.stop();
  console.log('[Renderer] Audio recording stopped');
}

// Track current status to avoid duplicate operations
let currentStatus = 'idle';

// Listen for ASR status changes from main process
window.api.asr.onStatus((status) => {
  console.log('[Renderer] ASR status changed:', status);

  // Avoid duplicate handling
  if (status === currentStatus) return;
  currentStatus = status;

  if (status === 'connecting' || status === 'listening') {
    // Start recording as early as possible and let the main process
    // buffer audio until the ASR socket is ready.
    startRecording();
  } else {
    // Stop recording for any other status
    stopRecording();
  }
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (recorder) {
    recorder.destroy();
    recorder = null;
  }
});

console.log('[Renderer] Auto-recording initialized, waiting for ASR status...');
