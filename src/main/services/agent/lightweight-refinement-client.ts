import log from 'electron-log';

const logger = log.scope('lightweight-refinement-client');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MAX_TOKENS = 220;
const DEFAULT_TEMPERATURE = 0.2;

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LightweightRefinementConfig {
  apiKey: string;
  baseUrl: string;
  targetModel: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
}

export interface LightweightRefinementRequest {
  systemPrompt: string;
  userPrompt: string;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${pathname}`;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const typedPart = part as { type?: string; text?: string };
        return typedPart.type === 'text' && typedPart.text ? typedPart.text : '';
      })
      .join('')
      .trim();
  }

  return '';
}

export function loadLightweightRefinementConfig(): LightweightRefinementConfig | null {
  const apiKey = process.env.ARK_API_KEY?.trim();
  const endpointId = process.env.DICTATION_REFINEMENT_ENDPOINT_ID?.trim();
  const model = process.env.DICTATION_REFINEMENT_MODEL?.trim();
  const targetModel = endpointId || model;

  if (!apiKey || !targetModel) {
    return null;
  }

  return {
    apiKey,
    baseUrl: process.env.DICTATION_REFINEMENT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    targetModel,
    timeoutMs: parseInteger(process.env.DICTATION_REFINEMENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxTokens: parseInteger(process.env.DICTATION_REFINEMENT_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    temperature: parseFloatNumber(
      process.env.DICTATION_REFINEMENT_TEMPERATURE,
      DEFAULT_TEMPERATURE,
    ),
  };
}

export class LightweightRefinementClient {
  constructor(private readonly config: LightweightRefinementConfig | null = loadLightweightRefinementConfig()) {}

  isConfigured(): boolean {
    return Boolean(this.config);
  }

  async refine(request: LightweightRefinementRequest): Promise<string | null> {
    if (!this.config) {
      logger.warn('Lightweight refinement model not configured');
      throw new Error('Lightweight refinement model not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(joinUrl(this.config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.targetModel,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ] satisfies ChatMessage[],
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let payload: unknown = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const errorMessage =
          typeof payload === 'object' &&
          payload &&
          'error' in payload &&
          typeof (payload as { error?: { message?: string } }).error?.message === 'string'
            ? (payload as { error: { message: string } }).error.message
            : rawText.slice(0, 200);

        throw new Error(`Ark refinement request failed: ${response.status} ${errorMessage}`);
      }

      const content = extractTextContent(
        (payload as {
          choices?: Array<{
            message?: { content?: unknown };
          }>;
        } | null)?.choices?.[0]?.message?.content,
      );

      return content || null;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Ark refinement request timed out');
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }
}

export const lightweightRefinementClient = new LightweightRefinementClient();
