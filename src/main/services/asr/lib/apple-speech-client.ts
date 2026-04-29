/**
 * Apple Speech Client.
 * Uses macOS SFSpeechRecognizer via a Swift helper for local speech recognition.
 * This is the fallback when Volcengine credentials are not configured.
 */

import { EventEmitter } from 'events';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import log from 'electron-log';
import type { ASRResult, ASRStatus } from '../../../../shared/types/asr';

const logger = log.scope('apple-speech');

const HELPER_SOURCE = path.join(
  process.resourcesPath ?? path.join(__dirname, '..', '..', '..', '..', '..', '..'),
  '..',
  'scripts',
  'apple-speech-helper.swift',
);

const HELPER_BINARY = path.join(
  process.resourcesPath ?? path.join(__dirname, '..', '..', '..', '..', '..', '..'),
  '..',
  'scripts',
  'apple-speech-helper',
);

/**
 * Check if Apple Speech is available on this system.
 */
export function isAppleSpeechAvailable(): boolean {
  if (process.platform !== 'darwin') return false;

  // Check macOS version (need 12+ for SFSpeechRecognizer)
  const release = os.release();
  const majorVersion = parseInt(release.split('.')[0], 10);
  // macOS 12 = Darwin 21.x.x
  if (majorVersion < 21) return false;

  // Check if helper binary exists
  return fs.existsSync(HELPER_BINARY);
}

export interface AppleSpeechClientEvents {
  status: (status: ASRStatus) => void;
  result: (result: ASRResult) => void;
  error: (error: Error) => void;
}

export class AppleSpeechClient extends EventEmitter {
  private child: ChildProcess | null = null;
  private audioChunks: ArrayBuffer[] = [];
  private connected = false;
  private readonly pcmChunks: Buffer[] = [];

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    logger.info('Apple Speech client: connect (buffer mode)');
    this.connected = true;
    this.emit('status', 'listening');
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.connected) {
      logger.warn('Apple Speech client: not connected, dropping chunk');
      return;
    }
    this.audioChunks.push(chunk.slice(0));
  }

  finishAudio(): void {
    if (!this.connected) return;

    logger.info('Apple Speech client: finish audio, processing buffered chunks', {
      chunkCount: this.audioChunks.length,
    });

    // Combine all buffered audio chunks
    const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = Buffer.alloc(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      combined.set(Buffer.from(chunk), offset);
      offset += chunk.byteLength;
    }
    this.audioChunks = [];

    if (totalLength === 0) {
      logger.warn('Apple Speech client: no audio data to process');
      this.emit('result', { text: '', isFinal: true });
      this.emit('status', 'done');
      this.connected = false;
      return;
    }

    // Spawn the Swift helper
    this.emit('status', 'processing');

    const helperPath = HELPER_BINARY;
    if (!fs.existsSync(helperPath)) {
      // Try to compile on the fly
      logger.info('Apple Speech client: helper binary not found, attempting to compile');
      this.compileAndRun(combined);
      return;
    }

    this.runHelper(helperPath, combined);
  }

  private compileAndRun(audioData: Buffer): void {
    const sourcePath = HELPER_SOURCE;
    const binaryPath = HELPER_BINARY;

    if (!fs.existsSync(sourcePath)) {
      this.emit('error', new Error('Apple Speech helper source not found'));
      this.emit('status', 'done');
      this.connected = false;
      return;
    }

    try {
      execFileSync('swiftc', [
        sourcePath,
        '-o', binaryPath,
        '-framework', 'Speech',
        '-framework', 'Foundation',
      ], { timeout: 30000 });
      logger.info('Apple Speech client: compiled helper successfully');
      this.runHelper(binaryPath, audioData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Apple Speech client: failed to compile helper', { error: msg });
      this.emit('error', new Error(`Failed to compile Apple Speech helper: ${msg}`));
      this.emit('status', 'done');
      this.connected = false;
    }
  }

  private runHelper(helperPath: string, audioData: Buffer): void {
    const child = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      this.child = null;
      this.connected = false;

      if (code !== 0 && !stdout.trim()) {
        logger.error('Apple Speech helper failed', { code, stderr });
        this.emit('error', new Error(`Apple Speech helper exited with code ${code}: ${stderr}`));
        this.emit('status', 'done');
        return;
      }

      // Parse JSON output
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      if (!lastLine) {
        this.emit('result', { text: '', isFinal: true });
        this.emit('status', 'done');
        return;
      }

      try {
        const parsed = JSON.parse(lastLine) as { text?: string; isFinal?: boolean; error?: string };
        if (parsed.error) {
          logger.warn('Apple Speech helper returned error', { error: parsed.error });
        }
        this.emit('result', {
          text: parsed.text ?? '',
          isFinal: parsed.isFinal ?? true,
        });
      } catch {
        // If not JSON, treat the whole output as text
        this.emit('result', { text: stdout.trim(), isFinal: true });
      }

      this.emit('status', 'done');
    });

    child.on('error', (err) => {
      this.child = null;
      this.connected = false;
      logger.error('Apple Speech client: process error', { error: err.message });
      this.emit('error', new Error(`Apple Speech process error: ${err.message}`));
      this.emit('status', 'done');
    });

    // Write audio data to stdin and close
    child.stdin?.write(audioData);
    child.stdin?.end();
  }

  disconnect(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.connected = false;
    this.audioChunks = [];
  }
}
