/**
 * Volcengine STTProvider implementation.
 * Adapts the existing ASRService to the generic STTProvider interface.
 */

import { asrService } from '../../main/services/asr';
import type { STTProvider, TranscribeOptions, TranscribeResult } from './provider';

export class VolcengineSTTProvider implements STTProvider {
  readonly name = 'volcengine';

  async startStream(options?: TranscribeOptions): Promise<void> {
    void options;
    await asrService.start();
  }

  sendChunk(chunk: ArrayBuffer): void {
    asrService.processAudioChunk(chunk);
  }

  async stopStream(): Promise<TranscribeResult> {
    const result = await asrService.stop();
    return {
      text: result?.text ?? '',
      confidence: undefined,
    };
  }
}

export const volcengineProvider = new VolcengineSTTProvider();
