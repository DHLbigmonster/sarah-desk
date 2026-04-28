import { describe, expect, it, vi } from 'vitest';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const {
  mockSpawn,
  mockExecFileSync,
  mockLoadMemory,
  mockAppendAction,
  mockRefine,
  mockIsConfigured,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFileSync: vi.fn(() => '/usr/local/bin/openclaw\n'),
  mockLoadMemory: vi.fn(() => ({ preferences: {}, recent_actions: [] })),
  mockAppendAction: vi.fn(),
  mockRefine: vi.fn(),
  mockIsConfigured: vi.fn(() => true),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  execFileSync: mockExecFileSync,
}));

vi.mock('electron-log', () => ({
  default: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

vi.mock('./memory.service', () => ({
  memoryService: {
    load: mockLoadMemory,
    appendAction: mockAppendAction,
  },
}));

vi.mock('./lightweight-refinement-client', () => ({
  lightweightRefinementClient: {
    isConfigured: mockIsConfigured,
    refine: mockRefine,
  },
}));

import { AgentService } from './agent.service';

describe('AgentService quick answer concurrency', () => {
  it('ignores stale quick-answer completions when a newer run starts', async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    mockRefine
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const service = new AgentService();
    const chunks: string[] = [];
    service.on('chunk', (chunk) => {
      if (chunk.type === 'text' && chunk.text) chunks.push(chunk.text);
    });

    const firstRun = service.execute('什么是旧问题？', { appName: 'Test', windowTitle: '' });
    await Promise.resolve();

    const secondRun = service.execute('什么是新问题？', { appName: 'Test', windowTitle: '' });
    await Promise.resolve();

    first.resolve('旧答案');
    await Promise.resolve();

    expect(chunks.join('')).not.toContain('旧答案');
    expect(service.isRunning).toBe(true);

    second.resolve('新答案');
    await Promise.all([firstRun, secondRun]);

    expect(chunks.join('')).toBe('新答案');
    expect(service.isRunning).toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockAppendAction).toHaveBeenCalledTimes(1);
    expect(mockAppendAction).toHaveBeenCalledWith('什么是新问题？', '新答案');
  });
});
