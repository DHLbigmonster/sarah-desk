import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('electron-log', () => ({
  default: {
    scope: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'which') throw new Error('not found');
    return '';
  }),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readdirSync: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('./memory.service', () => ({
  memoryService: {
    load: vi.fn().mockReturnValue({ preferences: {}, recent_actions: [] }),
    appendAction: vi.fn(),
  },
}));

import { spawn } from 'node:child_process';
import { AgentService } from './agent.service';

interface MockProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function createMockProcess(exitCode: number | null, stdout: string, stderr: string): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();

  // Simulate async output
  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  }, 5);

  return proc;
}

const FAKE_CONTEXT = {
  appName: 'TestApp',
  windowTitle: 'Test Window',
  url: '',
  screenshotPath: '',
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('AgentService', () => {
  let service: AgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentService();
  });

  afterEach(() => {
    service.abort(false);
  });

  it('should emit error when openclaw binary is not found (ENOENT)', async () => {
    const err = Object.assign(new Error('spawn openclaw ENOENT'), { code: 'ENOENT' });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const proc = new EventEmitter() as MockProcess;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();
      setTimeout(() => proc.emit('error', err), 5);
      return proc;
    });

    const errors: string[] = [];
    service.on('error', (msg: string) => errors.push(msg));

    await service.execute('test instruction', FAKE_CONTEXT);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('openclaw CLI 未找到');
  });

  it('should emit done with parsed text on successful execution', async () => {
    const response = JSON.stringify({
      result: {
        finalAssistantVisibleText: 'Hello from OpenClaw',
        payloads: [],
      },
    });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createMockProcess(0, response, ''),
    );

    const chunks: string[] = [];
    let done = false;
    service.on('chunk', (c: { type: string; text: string }) => chunks.push(c.text));
    service.on('done', () => { done = true; });

    await service.execute('test instruction', FAKE_CONTEXT);

    expect(chunks.join('')).toBe('Hello from OpenClaw');
    expect(done).toBe(true);
  });

  it('should emit error on non-zero exit code', async () => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createMockProcess(1, '', 'some error occurred'),
    );

    const errors: string[] = [];
    service.on('error', (msg: string) => errors.push(msg));

    await service.execute('test instruction', FAKE_CONTEXT);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('退出');
    expect(errors[0]).toContain('1');
  });

  it('should detect auth errors in stderr', async () => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createMockProcess(1, '', 'Error: API key not configured'),
    );

    const errors: string[] = [];
    service.on('error', (msg: string) => errors.push(msg));

    await service.execute('test instruction', FAKE_CONTEXT);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('未登录或鉴权失败');
  });

  it('should queue a second task while first is running', async () => {
    const firstProc = new EventEmitter() as MockProcess;
    firstProc.stdout = new EventEmitter();
    firstProc.stderr = new EventEmitter();
    firstProc.kill = vi.fn();

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      setTimeout(() => {
        firstProc.stdout.emit('data', Buffer.from(JSON.stringify({
          result: { finalAssistantVisibleText: 'first result', payloads: [] },
        })));
        firstProc.emit('close', 0);
      }, 50);
      return firstProc;
    });

    // Second call will also succeed
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      createMockProcess(0, JSON.stringify({
        result: { finalAssistantVisibleText: 'second result', payloads: [] },
      }), ''),
    );

    const chunks: string[] = [];
    service.on('chunk', (c: { type: string; text: string }) => chunks.push(c.text));

    // Fire both
    const p1 = service.execute('first', FAKE_CONTEXT);
    const p2 = service.execute('second', FAKE_CONTEXT);

    await p1;
    await p2;

    // Both results should have been emitted
    expect(chunks.some((c) => c.includes('first result'))).toBe(true);
    expect(chunks.some((c) => c.includes('second result'))).toBe(true);
  });

  it('should support abort()', async () => {
    const proc = new EventEmitter() as MockProcess;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      // Never emit close — simulates a hung process
      return proc;
    });

    let done = false;
    service.on('done', () => { done = true; });

    const execPromise = service.execute('test', FAKE_CONTEXT);

    // Give spawn a tick to fire
    await new Promise((r) => setTimeout(r, 10));

    service.abort(true);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(service.isRunning).toBe(false);
    expect(done).toBe(true);

    // Clean up: force resolve the hanging promise
    proc.emit('close', null);
    await execPromise;
  });
});
