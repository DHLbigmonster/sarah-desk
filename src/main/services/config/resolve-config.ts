/**
 * Central configuration resolver.
 *
 * Resolution order for any config key:
 *   1. credentialStore (GUI-written, encrypted) — higher priority
 *   2. process.env (dotenv-loaded from .env)    — fallback
 */

import { credentialStore } from './credential-store';

/**
 * ASR environment configuration.
 */
export interface ASREnvConfig {
  appId: string;
  accessToken: string;
  resourceId: string;
  enableNonstream: boolean;
  boostingTableId?: string;
  boostingTableName?: string;
  correctTableId?: string;
  correctTableName?: string;
}

/**
 * Lightweight refinement (Ark) configuration.
 */
export interface LightweightRefinementConfig {
  apiKey: string;
  baseUrl: string;
  targetModel: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Resolve a single config value. credentialStore takes priority over process.env.
 */
export function resolve(key: string): string | undefined {
  return credentialStore.get(key) ?? process.env[key];
}

/**
 * Resolve Volcengine ASR configuration.
 * Returns the config object, or throws if required fields are missing.
 */
export function resolveVolcengineConfig(): ASREnvConfig {
  const appId = resolve('VOLCENGINE_APP_ID');
  const accessToken = resolve('VOLCENGINE_ACCESS_TOKEN');
  const resourceId = resolve('VOLCENGINE_RESOURCE_ID') ?? 'volc.bigasr.sauc.duration';
  const enableNonstream = parseBoolean(resolve('VOLCENGINE_ENABLE_NONSTREAM'), true);
  const boostingTableId = resolve('VOLCENGINE_BOOSTING_TABLE_ID')?.trim() || undefined;
  const boostingTableName = resolve('VOLCENGINE_BOOSTING_TABLE_NAME')?.trim() || undefined;
  const correctTableId = resolve('VOLCENGINE_CORRECT_TABLE_ID')?.trim() || undefined;
  const correctTableName = resolve('VOLCENGINE_CORRECT_TABLE_NAME')?.trim() || undefined;

  const missingVars: string[] = [];
  if (!appId) missingVars.push('VOLCENGINE_APP_ID');
  if (!accessToken) missingVars.push('VOLCENGINE_ACCESS_TOKEN');

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required configuration: ${missingVars.join(', ')}`,
    );
  }

  return {
    appId: appId as string,
    accessToken: accessToken as string,
    resourceId,
    enableNonstream,
    boostingTableId,
    boostingTableName,
    correctTableId,
    correctTableName,
  };
}

/**
 * Resolve Ark lightweight refinement configuration.
 * Returns null if not configured (missing required fields).
 */
export function resolveArkConfig(): LightweightRefinementConfig | null {
  const apiKey = resolve('ARK_API_KEY')?.trim();
  const endpointId = resolve('DICTATION_REFINEMENT_ENDPOINT_ID')?.trim();
  const model = resolve('DICTATION_REFINEMENT_MODEL')?.trim();
  const targetModel = endpointId || model;

  if (!apiKey || !targetModel) {
    return null;
  }

  const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

  return {
    apiKey,
    baseUrl: resolve('DICTATION_REFINEMENT_BASE_URL')?.trim() || DEFAULT_BASE_URL,
    targetModel,
    timeoutMs: parseInteger(resolve('DICTATION_REFINEMENT_TIMEOUT_MS'), 7000),
    maxTokens: parseInteger(resolve('DICTATION_REFINEMENT_MAX_TOKENS'), 500),
    temperature: parseFloatNumber(resolve('DICTATION_REFINEMENT_TEMPERATURE'), 0.2),
  };
}

/**
 * Check if a config key is sourced from the credential store (not .env).
 */
export function isFromCredentialStore(key: string): boolean {
  return credentialStore.get(key) != null;
}
