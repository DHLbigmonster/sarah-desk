import log from 'electron-log';
import { resolveArkConfig } from '../config/resolve-config';
import type { LightweightRefinementConfig } from '../config/resolve-config';

const logger = log.scope('lightweight-refinement-client');

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export type { LightweightRefinementConfig };

export interface LightweightRefinementRequest {
  systemPrompt: string;
  userPrompt: string;
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
  return resolveArkConfig();
}

export class LightweightRefinementClient {
  constructor(private readonly configOverride: LightweightRefinementConfig | null = null) {}

  private getConfig(): LightweightRefinementConfig | null {
    return this.configOverride ?? loadLightweightRefinementConfig();
  }

  isConfigured(): boolean {
    return Boolean(this.getConfig());
  }

  async refine(request: LightweightRefinementRequest): Promise<string | null> {
    const config = this.getConfig();

    if (!config) {
      logger.warn('Lightweight refinement model not configured');
      throw new Error('Lightweight refinement model not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(joinUrl(config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.targetModel,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
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
