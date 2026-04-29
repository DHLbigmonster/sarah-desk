/**
 * AudioRecorder class for capturing microphone audio.
 * Uses Web Audio API to capture, process, and convert audio to PCM format.
 *
 * This is a vanilla TypeScript implementation that doesn't require React.
 * Can be used directly or wrapped in a React hook when needed.
 */

import { AUDIO_CONFIG, AUDIO_ERRORS } from '../constants';
import { float32ToArrayBuffer } from './pcm-converter';
import type {
  AudioChunkCallback,
  AudioLevelCallback,
  AudioRecorderState,
  AudioResources,
  StateChangeCallback,
} from '../types';

/**
 * AudioRecorder for capturing microphone audio and converting to PCM format.
 *
 * @example
 * ```typescript
 * const recorder = new AudioRecorder(
 *   (chunk) => {
 *     window.api.asr.sendAudio(chunk);
 *   },
 *   (state) => {
 *     console.log('Recording:', state.isRecording);
 *     if (state.error) console.error(state.error);
 *   }
 * );
 *
 * // Start recording
 * await recorder.start();
 *
 * // Stop recording
 * recorder.stop();
 *
 * // Clean up when done
 * recorder.destroy();
 * ```
 */
export class AudioRecorder {
  private state: AudioRecorderState = {
    isRecording: false,
    isStarting: false,
    error: null,
  };

  private resources: AudioResources | null = null;
  private onAudioChunk: AudioChunkCallback;
  private onAudioLevel: AudioLevelCallback | null;
  private onStateChange: StateChangeCallback | null;
  private startGeneration = 0;
  private stopRequestedDuringStart = false;

  /**
   * Creates a new AudioRecorder instance.
   *
   * @param onAudioChunk - Callback invoked with each audio chunk (PCM 16-bit ArrayBuffer)
   * @param onStateChange - Optional callback invoked when state changes
   */
  constructor(
    onAudioChunk: AudioChunkCallback,
    onStateChange?: StateChangeCallback,
    onAudioLevel?: AudioLevelCallback,
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onStateChange = onStateChange ?? null;
    this.onAudioLevel = onAudioLevel ?? null;
  }

  /**
   * Gets the current recorder state.
   */
  public getState(): AudioRecorderState {
    return { ...this.state };
  }

  /**
   * Whether recording is currently in progress.
   */
  public get isRecording(): boolean {
    return this.state.isRecording;
  }

  /**
   * Current error message, or null if no error.
   */
  public get error(): string | null {
    return this.state.error;
  }

  /**
   * Updates the internal state and notifies listeners.
   */
  private setState(newState: Partial<AudioRecorderState>): void {
    this.state = { ...this.state, ...newState };
    this.onStateChange?.(this.getState());
  }

  /**
   * Cleans up all audio resources.
   */
  private cleanupResources(): void {
    if (!this.resources) return;

    // Disconnect and close audio nodes
    this.resources.processorNode.disconnect();
    this.resources.sourceNode.disconnect();

    // Stop all media stream tracks
    this.resources.stream.getTracks().forEach((track: MediaStreamTrack) => {
      track.stop();
    });

    // Close the AudioContext
    void this.resources.audioContext.close();

    this.resources = null;
  }

  /**
   * Starts recording audio from the microphone.
   *
   * @returns Promise that resolves when recording starts, or rejects on error
   */
  public async start(): Promise<void> {
    // Check if already recording
    if (this.state.isRecording || this.state.isStarting) {
      this.setState({ error: AUDIO_ERRORS.ALREADY_RECORDING });
      return;
    }

    // Clear any previous error
    this.stopRequestedDuringStart = false;
    this.startGeneration += 1;
    const generation = this.startGeneration;
    this.setState({ error: null, isStarting: true });

    try {
      // Check for AudioContext support
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        this.setState({ error: AUDIO_ERRORS.AUDIO_CONTEXT_NOT_SUPPORTED });
        return;
      }

      // Request microphone access with audio constraints
      console.log('[AudioRecorder] Requesting getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      console.log('[AudioRecorder] getUserMedia succeeded');

      // Create AudioContext with desired sample rate
      const audioContext = new AudioContextClass({
        sampleRate: AUDIO_CONFIG.sampleRate,
      });

      // Hidden/off-screen windows may start with a suspended AudioContext
      if (audioContext.state !== 'running') {
        await audioContext.resume();
      }

      // Create source node from media stream
      const sourceNode = audioContext.createMediaStreamSource(stream);

      // Create ScriptProcessorNode for audio processing
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // AudioWorklet would be the modern replacement but requires more setup
      const processorNode = audioContext.createScriptProcessor(
        AUDIO_CONFIG.bufferSize,
        AUDIO_CONFIG.channelCount, // input channels
        AUDIO_CONFIG.channelCount // output channels
      );

      // Store callback reference for closure
      const onChunk = this.onAudioChunk;

      // Set up audio processing callback
      let chunkCount = 0;
      processorNode.onaudioprocess = (event: AudioProcessingEvent): void => {
        chunkCount++;
        if (chunkCount === 1 || chunkCount % 50 === 0) {
          console.log(`[AudioRecorder] onaudioprocess fired, chunk #${chunkCount}`);
        }

        // Get audio data from input buffer (channel 0 = mono)
        const inputData = event.inputBuffer.getChannelData(0);

        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        this.onAudioLevel?.(Math.max(0, Math.min(1, rms * 34)));

        // Convert Float32 audio to PCM 16-bit ArrayBuffer
        const pcmBuffer = float32ToArrayBuffer(inputData);

        // Send chunk to callback
        onChunk(pcmBuffer);
      };

      // Connect the audio graph: source -> processor -> destination
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      // Store resources for cleanup
      this.resources = {
        stream,
        audioContext,
        sourceNode,
        processorNode,
      };

      if (generation !== this.startGeneration || this.stopRequestedDuringStart) {
        this.cleanupResources();
        this.setState({ isRecording: false, isStarting: false });
        return;
      }

      this.setState({ isRecording: true, isStarting: false });
    } catch (err) {
      // Handle specific error types
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            this.setState({ error: AUDIO_ERRORS.PERMISSION_DENIED });
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            this.setState({ error: AUDIO_ERRORS.DEVICE_NOT_AVAILABLE });
            break;
          default:
            this.setState({ error: `Microphone error: ${err.message}` });
        }
      } else if (err instanceof Error) {
        this.setState({ error: `Failed to start recording: ${err.message}` });
      } else {
        this.setState({
          error: 'An unknown error occurred while starting recording',
        });
      }

      // Clean up any partially created resources
      this.cleanupResources();
      this.setState({ isStarting: false });
    }
  }

  /**
   * Stops the current recording.
   */
  public stop(): void {
    if (this.state.isStarting) {
      this.stopRequestedDuringStart = true;
      this.startGeneration += 1;
      this.setState({ isStarting: false });
    }

    if (!this.state.isRecording) {
      return;
    }

    this.cleanupResources();
    this.onAudioLevel?.(0);
    this.setState({ isRecording: false, isStarting: false });
  }

  /**
   * Cleans up all resources. Call this when the recorder is no longer needed.
   */
  public destroy(): void {
    this.stop();
    this.onStateChange = null;
  }
}
