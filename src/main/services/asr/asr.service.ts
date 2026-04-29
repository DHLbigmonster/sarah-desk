/**
 * ASR Service.
 * Manages the end-to-end ASR flow including WebSocket connection,
 * audio processing, and floating window display.
 */

import { EventEmitter } from 'events';
import log from 'electron-log';
import { VolcengineClient } from './lib/volcengine-client';
import { AppleSpeechClient, isAppleSpeechAvailable } from './lib/apple-speech-client';
import { loadASRConfig, ConfigurationError } from './lib/config';
import { floatingWindow } from '../../windows';
import type { ASRConfig, ASRResult, ASRStatus } from '../../../shared/types/asr';

const logger = log.scope('asr-service');

function toFriendlyASRErrorMessage(error: Error): string {
  if (error.message.includes('request and grant appid mismatch')) {
    return '火山引擎配置错误：VOLCENGINE_APP_ID 和 VOLCENGINE_ACCESS_TOKEN 不属于同一个应用。请在火山引擎控制台里进入同一个 ASR 应用，重新复制这两个值。';
  }

  if (error.message.includes('WebSocket upgrade failed: 401')) {
    return '火山引擎鉴权失败：请检查 APP_ID、Access Token、Resource ID 是否来自同一个已开通的大模型流式识别应用。';
  }

  return error.message;
}

/**
 * Event types emitted by ASRService.
 */
export interface ASRServiceEvents {
  status: (status: ASRStatus) => void;
  result: (result: ASRResult) => void;
  error: (error: Error) => void;
}

/**
 * Type-safe event emitter interface for ASRService.
 */
export interface ASRService {
  on<K extends keyof ASRServiceEvents>(event: K, listener: ASRServiceEvents[K]): this;
  off<K extends keyof ASRServiceEvents>(event: K, listener: ASRServiceEvents[K]): this;
  emit<K extends keyof ASRServiceEvents>(
    event: K,
    ...args: Parameters<ASRServiceEvents[K]>
  ): boolean;
}

/**
 * ASR Service manages the complete ASR flow.
 *
 * State machine:
 * ```
 * idle → connecting → listening → processing → done
 *                         ↓
 *                       error
 * ```
 *
 * @example
 * ```typescript
 * // Start ASR
 * await asrService.start();
 *
 * // Send audio chunks
 * asrService.processAudioChunk(audioBuffer);
 *
 * // Stop and get result
 * const result = await asrService.stop();
 * ```
 */
export class ASRService extends EventEmitter {
  private client: VolcengineClient | AppleSpeechClient | null = null;
  private usingAppleSpeech = false;
  private status: ASRStatus = 'idle';
  private finalResult: ASRResult | null = null;
  private lastResult: ASRResult | null = null;
  private lastNonEmptyResult: ASRResult | null = null;
  private pendingAudioChunks: ArrayBuffer[] = [];
  private readonly maxPendingAudioChunks = 64;
  private recordingStartTime: number | null = null;

  /**
   * Get current ASR status.
   */
  get currentStatus(): ASRStatus {
    return this.status;
  }

  /**
   * Start ASR session.
   *
   * @param config - Optional partial configuration to override environment variables
   * @throws ConfigurationError if required credentials are missing
   * @throws Error if connection fails after retries
   */
  async start(config?: Partial<ASRConfig>): Promise<void> {
    if (this.status !== 'idle') {
      logger.warn('ASR session already active, stopping previous session');
      await this.stop();
    }

    logger.info('Starting ASR session');
    this.reset();
    this.recordingStartTime = Date.now();

    // Load configuration from environment
    let envConfig;
    try {
      envConfig = loadASRConfig();
    } catch (error) {
      if (error instanceof ConfigurationError) {
        // Try Apple Speech fallback
        if (isAppleSpeechAvailable()) {
          logger.info('Volcengine ASR not configured, using Apple Speech fallback');
          this.usingAppleSpeech = true;
          this.client = new AppleSpeechClient();
          this.setupClientListeners();
          this.updateStatus('connecting');
          await this.client.connect();
          logger.info('Apple Speech session started');
          return;
        }
        logger.error('ASR configuration error', { message: error.message });
        this.updateStatus('error');
        this.emit('error', error);
        floatingWindow.sendError(error.message);
        throw error;
      }
      throw error;
    }

    // Merge with optional runtime config
    const clientConfig = {
      appId: config?.appId ?? envConfig.appId,
      accessToken: config?.accessToken ?? envConfig.accessToken,
      resourceId: config?.resourceId ?? envConfig.resourceId,
      enableNonstream: envConfig.enableNonstream,
      boostingTableId: envConfig.boostingTableId,
      boostingTableName: envConfig.boostingTableName,
      correctTableId: envConfig.correctTableId,
      correctTableName: envConfig.correctTableName,
    };

    // Create Volcengine client
    this.usingAppleSpeech = false;
    this.client = new VolcengineClient(clientConfig);

    // Setup event forwarding
    this.setupClientListeners();

    // Show floating window and update status
    this.updateStatus('connecting');

    // Connect to Volcengine service
    try {
      await this.client.connect();
      logger.info('ASR session started successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const friendlyMessage = toFriendlyASRErrorMessage(err);
      logger.error('Failed to connect to ASR service', {
        error: err.message,
        friendlyMessage,
      });
      this.updateStatus('error');
      this.emit('error', new Error(friendlyMessage));
      floatingWindow.sendError(friendlyMessage);
      this.cleanup();
      throw new Error(friendlyMessage);
    }
  }

  /**
   * Stop ASR session.
   *
   * @returns The final ASR result, or null if no result was received
   */
  async stop(): Promise<ASRResult | null> {
    if (!this.client || this.status === 'idle') {
      logger.warn('No active ASR session to stop');
      return null;
    }

    // Check minimum recording duration
    const duration = this.recordingStartTime
      ? Date.now() - this.recordingStartTime
      : 0;

    if (duration < 200) {
      logger.warn('Recording too short, ignoring', { duration });
      this.cleanup();
      return null;
    }

    logger.info('Stopping ASR session', { backend: this.usingAppleSpeech ? 'apple-speech' : 'volcengine' });

    if (this.usingAppleSpeech) {
      // Apple Speech: send finish signal and wait for helper process result
      this.client.finishAudio();
      const result = await this.waitForFinalResult();
      this.cleanup(true);
      return result;
    }

    // Signal end of audio to get final result
    if (this.client.isConnected) {
      (this.client as VolcengineClient).finishAudio();

      // Wait for final result with timeout
      const result = await this.waitForFinalResult();
      this.cleanup(true);
      return result;
    }

    this.cleanup(true);
    return this.finalResult;
  }

  /**
   * Process an audio chunk.
   * The chunk should be PCM 16-bit, 16kHz, mono format.
   *
   * @param chunk - Audio data as ArrayBuffer
   */
  processAudioChunk(chunk: ArrayBuffer): void {
    if (!this.client) {
      logger.warn('Cannot process audio: no active client');
      return;
    }

    // Apple Speech buffers all audio until finishAudio — just collect chunks
    if (this.usingAppleSpeech) {
      this.client.sendAudio(chunk);
      return;
    }

    if (this.status === 'connecting' || !this.client.isConnected) {
      if (this.pendingAudioChunks.length >= this.maxPendingAudioChunks) {
        this.pendingAudioChunks.shift();
      }
      this.pendingAudioChunks.push(chunk.slice(0));
      return;
    }

    if (this.status !== 'listening') {
      logger.warn('Cannot process audio: not in listening state', { status: this.status });
      return;
    }

    (this.client as VolcengineClient).sendAudio(chunk);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Reset service state for a new session.
   */
  private reset(): void {
    this.finalResult = null;
    this.lastResult = null;
    this.lastNonEmptyResult = null;
    this.pendingAudioChunks = [];
    this.status = 'idle';
  }

  /**
   * Update status and emit event.
   */
  private updateStatus(status: ASRStatus): void {
    this.status = status;
    this.emit('status', status);
    floatingWindow.sendStatus(status);
    logger.debug('Status updated', { status });
  }

  /**
   * Setup event listeners on the ASR client (Volcengine or Apple Speech).
   */
  private setupClientListeners(): void {
    if (!this.client) return;

    // Both VolcengineClient and AppleSpeechClient extend EventEmitter,
    // so cast to EventEmitter for compatible listener signatures.
    const emitter = this.client as unknown as EventEmitter;

    emitter.on('status', (status: ASRStatus) => {
      // Terminal client statuses are internal transport lifecycle signals.
      // Higher-level mode handlers own the post-STT HUD state.
      if (status !== 'done' && status !== 'idle') {
        this.updateStatus(status);
      }
      if (status === 'listening' && !this.usingAppleSpeech) {
        this.flushPendingAudioChunks();
      }
    });

    emitter.on('result', (result: ASRResult) => {
      this.lastResult = result;
      if (result.text.trim()) {
        this.lastNonEmptyResult = result;
      }

      if (result.isFinal) {
        this.finalResult = result;
      }

      this.emit('result', result);
      floatingWindow.sendResult(result);
    });

    emitter.on('error', (error: Error) => {
      const friendlyMessage = toFriendlyASRErrorMessage(error);
      logger.error('Volcengine client error', { message: error.message, friendlyMessage });
      this.updateStatus('error');
      this.emit('error', new Error(friendlyMessage));
      floatingWindow.sendError(friendlyMessage);
    });
  }

  /**
   * Wait for final result with timeout.
   */
  private waitForFinalResult(): Promise<ASRResult | null> {
    return new Promise((resolve) => {
      // If we already have a final result, return it
      if (this.finalResult) {
        resolve(this.pickBestResult());
        return;
      }

      const TIMEOUT_MS = 10000; // 10 seconds timeout
      let resolved = false;
      const emitter = this.client as unknown as EventEmitter | null;

      const resultHandler = (result: ASRResult): void => {
        if (result.isFinal && !resolved) {
          resolved = true;
          emitter?.off('result', resultHandler);
          emitter?.off('status', statusHandler);
          clearTimeout(timeoutId);
          resolve(result.text.trim() ? result : this.pickBestResult());
        }
      };

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          emitter?.off('result', resultHandler);
          emitter?.off('status', statusHandler);
          logger.warn('Timeout waiting for final result, returning last result');
          resolve(this.pickBestResult());
        }
      }, TIMEOUT_MS);

      emitter?.on('result', resultHandler);

      // Also listen for done status as backup
      const statusHandler = (status: ASRStatus): void => {
        if (status === 'done' && !resolved) {
          // Give a small delay for the final result to come through
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              emitter?.off('result', resultHandler);
              emitter?.off('status', statusHandler);
              clearTimeout(timeoutId);
              resolve(this.pickBestResult());
            }
          }, 500);
        }
      };

      emitter?.on('status', statusHandler);
    });
  }

  private flushPendingAudioChunks(): void {
    if (!this.client?.isConnected || this.pendingAudioChunks.length === 0) {
      return;
    }

    const chunks = this.pendingAudioChunks;
    this.pendingAudioChunks = [];
    logger.info('Flushing buffered audio chunks', { count: chunks.length });

    for (const chunk of chunks) {
      this.client.sendAudio(chunk);
    }
  }

  private pickBestResult(): ASRResult | null {
    if (this.finalResult?.text.trim()) return this.finalResult;
    if (this.lastNonEmptyResult?.text.trim()) return this.lastNonEmptyResult;
    if (this.lastResult?.text.trim()) return this.lastResult;
    return this.finalResult ?? this.lastResult;
  }

  /**
   * Cleanup resources.
   */
  private cleanup(suppressHudIdle = false): void {
    if (this.client) {
      this.client.removeAllListeners();
      this.client.disconnect();
      this.client = null;
    }

    this.status = 'idle';
    this.emit('status', 'idle');
    if (!suppressHudIdle) {
      floatingWindow.sendStatus('idle');
    }
    logger.debug('Status updated', { status: 'idle', suppressHudIdle });
    logger.info('ASR session cleaned up');
  }
}

/**
 * Singleton instance of the ASR service.
 */
export const asrService = new ASRService();
