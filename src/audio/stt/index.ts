export type { STTProvider, TranscribeOptions, TranscribeResult } from './provider';
export { VolcengineSTTProvider, volcengineProvider } from './volcengine-provider';

/**
 * Active STT provider singleton.
 * Replace this reference to swap vendors without touching callers.
 */
export { volcengineProvider as activeSttProvider } from './volcengine-provider';
