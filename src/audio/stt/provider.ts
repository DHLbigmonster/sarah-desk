/**
 * STTProvider interface — decouples the voice pipeline from any single vendor.
 * Swap implementations without touching push-to-talk or agent-voice logic.
 */

export interface TranscribeOptions {
  language?: string;
}

export interface TranscribeResult {
  text: string;
  language?: string;
  confidence?: number;
}

/**
 * Streaming STT provider.  All streaming implementations must implement this
 * interface so the rest of the system can treat them interchangeably.
 *
 * Lifecycle: startStream → sendChunk (many) → stopStream
 */
export interface STTProvider {
  /** Human-readable provider name for logs/UI */
  readonly name: string;

  /**
   * Open a recognition session.  Call before the first sendChunk.
   * @throws if credentials are missing or the connection fails
   */
  startStream(options?: TranscribeOptions): Promise<void>;

  /**
   * Push a PCM-16 / 16 kHz / mono audio chunk into the session.
   * Safe to call even if the stream is not yet fully open (implementors must buffer).
   */
  sendChunk(chunk: ArrayBuffer): void;

  /**
   * Signal end-of-audio, wait for the final transcript, and close the session.
   * @returns The best available result (may be empty if nothing was recognised)
   */
  stopStream(): Promise<TranscribeResult>;
}
