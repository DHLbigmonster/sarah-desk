import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy deps that are not relevant to routing logic
vi.mock('electron-log', () => ({
  default: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('./dictionary.service', () => ({
  dictionaryService: { apply: (text: string) => text },
}));
vi.mock('./lightweight-refinement-client', () => ({
  lightweightRefinementClient: {
    isConfigured: () => false,
    refine: async () => { throw new Error('not configured'); },
  },
}));

import { DictationRefinementService, type RefinementMode } from './dictation-refinement.service';

// Access the private chooseMode for unit testing routing decisions
function chooseMode(service: DictationRefinementService, text: string): RefinementMode {
  return (service as unknown as { chooseMode(t: string): { mode: RefinementMode } }).chooseMode(text).mode;
}

describe('DictationRefinementService — mode routing', () => {
  let svc: DictationRefinementService;

  beforeEach(() => {
    svc = new DictationRefinementService();
  });

  // ── Length-based routing ───────────────────────────────────────────────────

  it('uses fast_clean for short plain text (< 28 chars)', () => {
    expect(chooseMode(svc, '今天天气不错，去超市买。')).toBe('fast_clean_model');
  });

  it('uses smart_structured for medium-length plain text (>= 40 chars)', () => {
    const text = '今天我想总结一下本周工作情况，项目进展还算顺利，团队配合也比较默契，没有什么大问题需要单独处理。';
    expect(text.length).toBeGreaterThanOrEqual(40);
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  it('uses smart_structured for text longer than 40 chars', () => {
    const longText = 'Today I want to review what happened this week. We made progress.';
    expect(longText.length).toBeGreaterThanOrEqual(40);
    expect(chooseMode(svc, longText)).toBe('smart_structured_model');
  });

  // ── Pattern-based routing ─────────────────────────────────────────────────

  it('uses smart_structured when text contains list markers (第一/第二)', () => {
    const text = '第一步配置环境，第二步安装依赖，第三步运行测试。';
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  it('uses smart_structured when text contains numbered list (1. 2.)', () => {
    const text = '1. 打开设置 2. 找到声音选项 3. 调整音量。';
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  it('uses smart_structured when text contains ordered connectors (首先/其次/最后)', () => {
    const text = '首先检查权限，其次确认配置，最后重启应用。';
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  it('uses smart_structured when text contains restart phrases (我是说/换句话说)', () => {
    const text = '把这个改一下，我是说把颜色换成蓝色。';
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  it('uses smart_structured when fillers appear in medium-length text', () => {
    // > FAST_CLEAN_MAX_LENGTH (28) plus filler markers triggers smart polish.
    const text = '嗯这个就是那个啊比较难说嗯就是确实那个不太好讲就是说嗯不太确定。';
    expect(text.length).toBeGreaterThan(28);
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  // ── Boundary: text exactly at threshold ───────────────────────────────────

  it('uses fast_clean for short plain text below the structured threshold', () => {
    // Below SMART_STRUCTURED_MIN_LENGTH (40) and no list/restart/filler patterns.
    const text = 'Short clean dictation note here please.';
    expect(text.length).toBeLessThan(40);
    expect(chooseMode(svc, text)).toBe('fast_clean_model');
  });
});

describe('DictationRefinementService — refine() public API', () => {
  let svc: DictationRefinementService;

  beforeEach(() => {
    svc = new DictationRefinementService();
  });

  it('returns empty string for empty input', async () => {
    expect(await svc.refine('')).toBe('');
    expect(await svc.refine('   ')).toBe('');
  });

  it('returns a non-empty string for valid input', async () => {
    const result = await svc.refine('今天天气不错。');
    expect(result.length).toBeGreaterThan(0);
  });

  it('strips filler words that appear between punctuation via local fallback', async () => {
    // 嗯 surrounded by ，satisfies the regex lookahead/lookbehind
    const result = await svc.refine('今天，嗯，天气不错。');
    expect(result).not.toContain('嗯');
  });

  it('splits numbered list into lines via local structured fallback', async () => {
    const result = await svc.refine('第一步安装依赖，第二步启动服务，第三步测试接口。');
    // local structured fallback inserts newline before each ordinal
    const lines = result.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((l) => l.includes('第一'))).toBe(true);
    expect(lines.some((l) => l.includes('第二'))).toBe(true);
  });
});
