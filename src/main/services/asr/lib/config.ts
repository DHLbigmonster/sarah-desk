/**
 * ASR configuration loader.
 * Delegates to the central config resolver (credential store first, then .env fallback).
 */

import { resolveVolcengineConfig, resolve } from '../../config/resolve-config';
import type { ASREnvConfig } from '../../config/resolve-config';

/**
 * Configuration error when required environment variables are missing.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Load ASR configuration.
 * @throws ConfigurationError if required variables are missing
 */
export function loadASRConfig(): ASREnvConfig {
  try {
    return resolveVolcengineConfig();
  } catch (err) {
    // Re-throw as ConfigurationError for backward compatibility with asr.service.ts
    throw new ConfigurationError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Check if ASR configuration is available without throwing.
 */
export function isASRConfigured(): boolean {
  return Boolean(resolve('VOLCENGINE_APP_ID') && resolve('VOLCENGINE_ACCESS_TOKEN'));
}

export type { ASREnvConfig };
