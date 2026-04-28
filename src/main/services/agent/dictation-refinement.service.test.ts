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

  it('uses fast_clean for short plain text (< 72 chars)', () => {
    expect(chooseMode(svc, '今天天气不错，去超市买点东西。')).toBe('fast_clean_model');
  });

  it('uses fast_clean for medium-length plain text between thresholds', () => {
    const text = '今天我想总结一下工作情况，项目进展还算顺利，没有太多问题。';
    expect(text.length).toBeLessThan(96);
    expect(chooseMode(svc, text)).toBe('fast_clean_model');
  });

  it('uses smart_structured for text longer than 96 chars', () => {
    // >96 ASCII chars — unambiguous length, no list/restart patterns
    const longText = 'Today I want to review what happened this week. We made very good progress on multiple fronts, okay!!';
    expect(longText.length).toBeGreaterThan(96);
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

  it('uses smart_structured when heavy fillers appear 3+ times', () => {
    const text = '嗯这个就是那个啊比较难说。'; // 嗯、就是、啊 = 3 fillers
    expect(chooseMode(svc, text)).toBe('smart_structured_model');
  });

  // ── Boundary: text exactly at threshold ───────────────────────────────────

  it('uses fast_clean for text in 72–95 char range with no structural signals', () => {
    // Explicit 80-char ASCII string — in range, no list/restart/heavy-filler patterns
    const text = 'The meeting went well and we covered all agenda items without any major issues.';
    expect(text.length).toBeGreaterThanOrEqual(72);
    expect(text.length).toBeLessThan(96);
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
