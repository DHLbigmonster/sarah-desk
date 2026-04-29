/**
 * Config keys managed by each provider.
 * Shared between main process (IPC validation) and renderer (form fields).
 */

export const PROVIDER_KEYS = {
  voice: [
    'VOLCENGINE_APP_ID',
    'VOLCENGINE_ACCESS_TOKEN',
    'VOLCENGINE_RESOURCE_ID',
    'VOLCENGINE_ENABLE_NONSTREAM',
    'VOLCENGINE_BOOSTING_TABLE_ID',
    'VOLCENGINE_BOOSTING_TABLE_NAME',
    'VOLCENGINE_CORRECT_TABLE_ID',
    'VOLCENGINE_CORRECT_TABLE_NAME',
  ],
  text: [
    'ARK_API_KEY',
    'DICTATION_REFINEMENT_ENDPOINT_ID',
    'DICTATION_REFINEMENT_MODEL',
    'DICTATION_REFINEMENT_BASE_URL',
    'DICTATION_REFINEMENT_TIMEOUT_MS',
    'DICTATION_REFINEMENT_MAX_TOKENS',
    'DICTATION_REFINEMENT_TEMPERATURE',
  ],
} as const;

export type ProviderId = keyof typeof PROVIDER_KEYS;

/** All known config key names across all providers. */
const ALL_KEYS = new Set<string>([
  ...PROVIDER_KEYS.voice,
  ...PROVIDER_KEYS.text,
]);

/** Check whether a key belongs to a known provider. */
export function isValidProviderKey(key: string): boolean {
  return ALL_KEYS.has(key);
}
