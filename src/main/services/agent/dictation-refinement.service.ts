import log from 'electron-log';
import { dictionaryService } from './dictionary.service';
import { lightweightRefinementClient } from './lightweight-refinement-client';

const logger = log.scope('dictation-refinement');

export type RefinementMode = 'fast_clean_model' | 'smart_structured_model';

interface RefinementDecision {
  mode: RefinementMode;
  reasons: string[];
}

const FAST_CLEAN_MAX_LENGTH = 28;
const SMART_STRUCTURED_MIN_LENGTH = 40;

const FAST_CLEAN_SYSTEM_PROMPT = `你负责把语音听写整理成可以直接发送或输入的文字，不是聊天。

规则：
1. 保留原意，不得新增原文没有的信息。
2. 删除口头禅、重复词、自我修正残片，补齐中文标点。
3. 可以轻微调整语序，让它像人打出来的自然中文。
4. 不要硬拆成列表；除非原文明确是在列事项。
5. 输出应该像熟练打字者直接输入的自然中文，而非机械转写。
6. 只输出最终整理文本，不要解释。`;

const SMART_STRUCTURED_SYSTEM_PROMPT = `你负责把中文语音听写改写成接近 Typeless 风格的高质量输入文本，不是聊天。

规则：
1. 保留原意，不得新增原文没有的观点、结论或行动项。
2. 主动修复边想边说造成的断句、重复、倒装、自我修正和半截表达。
3. 删除“嗯、呃、就是、然后、那个、怎么说、不对、等一下”等不影响意思的口语残片。
4. 补齐自然的标点和段落，让输出像已经认真打磨过的中文输入。
5. 如果原文明显是事项、计划、步骤或总结，可以整理成短段落或列表；普通口述保持自然段。
6. 如果原文确实没说完，不要编造结尾，只把已有内容整理顺。
7. 只输出最终整理文本，不要解释。`;

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
  return `请把下面这段中文语音转写整理成可直接输入的最终文本：

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

    if (text.length >= SMART_STRUCTURED_MIN_LENGTH) reasons.push('long_or_medium_text');
    if (hasListShape) reasons.push('list_shape');
    if (hasRestartShape) reasons.push('restart_shape');
    if (fillerCount >= 1) reasons.push('spoken_fillers');
    if (repeatedPhraseCount >= 2) reasons.push('repeated_phrases');

    if (
      text.length >= SMART_STRUCTURED_MIN_LENGTH ||
      hasListShape ||
      hasRestartShape ||
      (text.length > FAST_CLEAN_MAX_LENGTH && fillerCount >= 1) ||
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

    // Log original text for debugging
    logger.info('dictation_raw_input', {
      mode: decision.mode,
      originalText: precleaned,
    });

    try {
      const modelResult = await this.refineWithModel(precleaned, decision.mode);
      if (modelResult?.trim()) {
        const normalizedResult = normalizePunctuation(modelResult);
        logger.info('model_refinement_success', {
          mode: decision.mode,
          textLength: precleaned.length,
          outputLength: normalizedResult.length,
          originalText: precleaned,
          refinedText: normalizedResult,
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

    // Fallback to local cleaning
    const localResult = this.refineLocally(precleaned, decision.mode);
    logger.info('local_refinement_fallback', {
      mode: decision.mode,
      originalText: precleaned,
      refinedText: localResult,
    });
    return localResult;
  }
}

export const dictationRefinementService = new DictationRefinementService();
