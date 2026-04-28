import log from 'electron-log';
import { dictionaryService } from './dictionary.service';
import { lightweightRefinementClient } from './lightweight-refinement-client';

const logger = log.scope('dictation-refinement');

export type RefinementMode = 'fast_clean_model' | 'smart_structured_model';

interface RefinementDecision {
  mode: RefinementMode;
  reasons: string[];
}

const FAST_CLEAN_MAX_LENGTH = 72;
const SMART_STRUCTURED_MIN_LENGTH = 96;

const FAST_CLEAN_SYSTEM_PROMPT = `你负责语音听写轻整理，不是聊天。

规则：
1. 保留原意，不得新增原文没有的信息。
2. 只做去口头禅、删重复、补标点、轻微断句。
3. 不要强行改写句子结构，不要硬拆成列表。
4. 输出自然、简洁，像正常打字后的中文。
5. 只输出最终整理文本，不要解释。`;

const SMART_STRUCTURED_SYSTEM_PROMPT = `你负责语音听写结构化整理，不是聊天。

规则：
1. 保留原意，不得新增原文没有的观点、结论或行动项。
2. 允许重组句子顺序，修复边想边说造成的断裂表达。
3. 适合整理长段、列事项、计划、总结、边想边说的口述。
4. 如果原文明显是事项列表或计划，可整理成清晰的分段或列表；如果不是，就保持自然段。
5. 删除口头禅、重复、停顿词，补齐标点与段落。
6. 只输出最终整理文本，不要解释。`;

function normalizePunctuation(text: string): string {
  return text
    .replace(/\u200b/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[，,]{2,}/g, '，')
    .replace(/[。.]{2,}/g, '。')
    .replace(/[！？!？]{2,}/g, '。')
    .replace(/\s*([，。！？；：])/g, '$1')
    .trim();
}

function precleanTranscript(text: string): string {
  return normalizePunctuation(
    text
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, '\'')
      .replace(/\s+([，。！？；：])/g, '$1')
      .replace(/([，。！？；：])\1+/g, '$1'),
  );
}

function localCleanFallback(text: string): string {
  return normalizePunctuation(
    text
      .replace(/(^|[，。！？\s])(嗯|呃|额|啊|那个|就是)(?=[，。！？\s]|$)/g, '$1')
      .replace(/(^|[，。！？\s])(然后|其实|怎么说)(?=[，。！？\s]|$)/g, '$1')
      .replace(/(能否能|是否能)/g, '能否')
      .replace(/的的/g, '的')
      .replace(/，(?=，|。|！|？|；|：)/g, '')
      .replace(/([，。！？；：])\s+/g, '$1'),
  );
}

function localStructuredFallback(text: string): string {
  return localCleanFallback(text)
    .replace(/(第[一二三四五六七八九十][，、:]?)/g, '\n$1 ')
    .replace(/([1-9][.、])/g, '\n$1 ')
    .replace(/(首先|其次|最后|另外|然后)/g, '\n$1')
    .replace(/([。！？])(?=[^\n])/g, '$1\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(transcript: string): string {
  return `请整理这段中文语音转写文本，直接输出最终文本：

${transcript}`;
}

export class DictationRefinementService {
  private chooseMode(text: string): RefinementDecision {
    const reasons: string[] = [];

    const hasListShape = /第[一二三四五六七八九十]|[1-9][.、]|首先|其次|最后|另外/.test(text);
    const hasRestartShape = /我是说|我的意思是|换句话说|重新说|先这样|等一下|不对|改一下/.test(text);
    const fillerCount = (text.match(/[嗯额呃啊]|那个|就是(?!说)|然后|其实|怎么说/g) ?? []).length;
    const segs = text.match(/[\u4e00-\u9fa5]{2,4}/g) ?? [];
    const freq = new Map<string, number>();

    for (const segment of segs) {
      freq.set(segment, (freq.get(segment) ?? 0) + 1);
    }

    const repeatedPhraseCount = [...freq.values()].filter((value) => value > 1).length;

    if (text.length > SMART_STRUCTURED_MIN_LENGTH) reasons.push('long_text');
    if (hasListShape) reasons.push('list_shape');
    if (hasRestartShape) reasons.push('restart_shape');
    if (fillerCount >= 3) reasons.push('heavy_fillers');
    if (repeatedPhraseCount >= 2) reasons.push('repeated_phrases');

    if (
      text.length > SMART_STRUCTURED_MIN_LENGTH ||
      hasListShape ||
      hasRestartShape ||
      fillerCount >= 3 ||
      repeatedPhraseCount >= 2
    ) {
      return { mode: 'smart_structured_model', reasons };
    }

    reasons.push(text.length <= FAST_CLEAN_MAX_LENGTH ? 'short_plain_utterance' : 'medium_plain_utterance');
    return { mode: 'fast_clean_model', reasons };
  }

  private refineLocally(text: string, mode: RefinementMode): string {
    return mode === 'smart_structured_model'
      ? localStructuredFallback(text)
      : localCleanFallback(text);
  }

  private async refineWithModel(text: string, mode: RefinementMode): Promise<string | null> {
    return lightweightRefinementClient.refine({
      systemPrompt: mode === 'smart_structured_model'
        ? SMART_STRUCTURED_SYSTEM_PROMPT
        : FAST_CLEAN_SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(text),
    });
  }

  async refine(transcript: string): Promise<string> {
    const trimmed = transcript.trim();
    if (!trimmed) return '';

    const corrected = dictionaryService.apply(trimmed);
    const precleaned = precleanTranscript(corrected);
    const decision = this.chooseMode(precleaned);

    logger.info('Dictation refinement decision', {
      mode: decision.mode,
      reasons: decision.reasons,
      textLength: precleaned.length,
      modelConfigured: lightweightRefinementClient.isConfigured(),
    });

    try {
      const modelResult = await this.refineWithModel(precleaned, decision.mode);
      if (modelResult?.trim()) {
        const normalizedResult = normalizePunctuation(modelResult);
        logger.info('model_refinement_success', {
          mode: decision.mode,
          textLength: precleaned.length,
          outputLength: normalizedResult.length,
        });
        return normalizedResult;
      }

      logger.warn('model_refinement_fallback', {
        mode: decision.mode,
        reason: 'empty_result',
      });
    } catch (error) {
      logger.warn('model_refinement_fallback', {
        mode: decision.mode,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    return this.refineLocally(precleaned, decision.mode);
  }
}

export const dictationRefinementService = new DictationRefinementService();
