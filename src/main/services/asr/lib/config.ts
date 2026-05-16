import { resolveVolcengineConfig, type ASREnvConfig } from '../../config/resolve-config';

export type { ASREnvConfig };

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function loadASRConfig(): ASREnvConfig {
  try {
    return resolveVolcengineConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(message);
  }
}

export function isASRConfigured(): boolean {
  try {
    loadASRConfig();
    return true;
  } catch {
    return false;
  }
}
