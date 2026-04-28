import { describe, expect, it, vi } from 'vitest';

vi.mock('electron-log', () => ({
  default: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { IntentRouter } from './intent-router.service';

describe('IntentRouter', () => {
  const router = new IntentRouter();

  it.each([
    ['什么是 Sarah？', 't1', 'qa:q-word'],
    ['帮我解释一下量子纠缠', 't1', 'qa:explain'],
    ['翻译 hello world', 't1', 'qa:text-task'],
    ['今天天气如何？', 't1', 'qa:question-mark'],
    ['谢谢', 't1', 'short-no-tool'],
    ['总结一下这个短句', 't1', 'qa:text-task'],
    ['打开这个网页 https://example.com', 't2', 'tool:url'],
    ['把这个网页内容加到飞书多维表格', 't2', 'tool:web'],
    ['发送消息到飞书群', 't2', 'tool:lark'],
    ['执行一下 shell 命令', 't2', 'tool:shell'],
    ['搜索一下 google 上的资料', 't2', 'tool:search'],
    [`${'这是一段很长的普通任务描述。'.repeat(20)}`, 't2', 'long-prompt'],
  ] as const)('routes "%s" to %s because %s', (text, tier, reason) => {
    expect(router.classify(text)).toEqual({ tier, reason });
  });
});
