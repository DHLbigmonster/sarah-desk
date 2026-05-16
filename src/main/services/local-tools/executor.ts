import { shell } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log';
import type {
  LocalToolExecutionRequest,
  LocalToolExecutionResult,
} from '../../../shared/types/local-tools';

const logger = log.scope('local-tools:executor');
const execFileAsync = promisify(execFile);
const EXEC_PATH = [
  process.env.PATH ?? '',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/node22/bin',
  `${process.env.HOME ?? ''}/.local/bin`,
].filter(Boolean).join(':');

type Executor = (
  args: NonNullable<LocalToolExecutionRequest['args']>,
) => Promise<LocalToolExecutionResult>;

function argString(
  args: NonNullable<LocalToolExecutionRequest['args']>,
  key: string,
): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

function markdownEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function buildVisibleContextMarkdown(args: NonNullable<LocalToolExecutionRequest['args']>): { title: string; markdown: string } {
  const appName = argString(args, 'appName') || 'Unknown App';
  const windowTitle = argString(args, 'windowTitle');
  const url = argString(args, 'url');
  const question = argString(args, 'question');
  const answer = argString(args, 'answer');
  const ocrText = argString(args, 'ocrText');
  const timestamp = new Date().toLocaleString();
  const titleBase = windowTitle || appName;
  const title = `Sarah Capture - ${titleBase}`.slice(0, 120);
  const lines = [
    `# ${title}`,
    '',
    '> Sarah 自动整理的当前页面/屏幕上下文。',
    '',
    '## Source',
    '',
    `- App: ${appName}`,
    windowTitle ? `- Window: ${windowTitle}` : '',
    url ? `- URL: ${url}` : '',
    `- Captured: ${timestamp}`,
    '',
    question ? '## Request' : '',
    question ? '' : '',
    question ? question : '',
    '',
    answer ? '## Sarah Summary' : '',
    answer ? '' : '',
    answer ? answer : '',
    '',
    ocrText ? '## Visible Text OCR' : '',
    ocrText ? '' : '',
    ocrText ? '```text' : '',
    ocrText ? markdownEscape(ocrText) : '',
    ocrText ? '```' : '',
  ].filter((line, index, all) => {
    if (line) return true;
    return all[index - 1] !== '' && all[index + 1] !== '';
  });
  return { title, markdown: lines.join('\n').trim() };
}

function extractLarkDocUrl(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      data?: { document?: { url?: string } };
      document?: { url?: string };
      url?: string;
    };
    return parsed.data?.document?.url ?? parsed.document?.url ?? parsed.url ?? null;
  } catch {
    const direct = raw.match(/https?:\/\/\S+/);
    return direct ? direct[0].replace(/["'),.，。]+$/, '') : null;
  }
}

const EXECUTORS: Record<string, Executor> = {
  'hermes-computer-use.setup': async () => {
    const script = [
      'tell application "Terminal"',
      'activate',
      'do script "hermes computer-use install"',
      'end tell',
    ].join('\n');
    await execFileAsync('osascript', ['-e', script], { timeout: 4000 });
    return { success: true, output: 'Opened Hermes Computer Use installer in Terminal.' };
  },

  'openclaw-peekaboo.setup': async () => {
    const command = [
      'openclaw skills info peekaboo',
      'echo',
      'echo "Install option shown by OpenClaw: brew install peekaboo"',
    ].join('; ');
    const script = [
      'tell application "Terminal"',
      'activate',
      `do script ${JSON.stringify(command)}`,
      'end tell',
    ].join('\n');
    await execFileAsync('osascript', ['-e', script], { timeout: 4000 });
    return { success: true, output: 'Opened OpenClaw Peekaboo setup details in Terminal.' };
  },

  'lark-cli.visible-context.create-doc': async (args) => {
    const { title, markdown } = buildVisibleContextMarkdown(args);
    if (!markdown) {
      return { success: false, error: 'No visible context was provided.' };
    }
    const result = await execFileAsync(
      'lark-cli',
      ['docs', '+create', '--title', title, '--markdown', markdown],
      {
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, PATH: EXEC_PATH },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const url = extractLarkDocUrl(output);
    return {
      success: true,
      output: url ? `Created Feishu document: ${url}` : `Created Feishu document: ${title}`,
    };
  },

  'obsidian.vault.open': async (args) => {
    const vault = typeof args.vault === 'string' ? args.vault : '';
    const file = typeof args.file === 'string' ? args.file : '';
    const url = vault
      ? `obsidian://open?vault=${encodeURIComponent(vault)}${file ? `&file=${encodeURIComponent(file)}` : ''}`
      : 'obsidian://open';
    await shell.openExternal(url);
    return { success: true, output: `Opened ${url}` };
  },

  'obsidian.note.create': async (args) => {
    const vault = typeof args.vault === 'string' ? args.vault : '';
    const name = typeof args.name === 'string' ? args.name : '';
    const content = typeof args.content === 'string' ? args.content : '';
    if (!name) {
      return { success: false, error: 'Note name is required.' };
    }
    const params = new URLSearchParams();
    if (vault) params.set('vault', vault);
    params.set('name', name);
    if (content) params.set('content', content);
    const url = `obsidian://new?${params.toString()}`;
    await shell.openExternal(url);
    return { success: true, output: `Created note via ${url}` };
  },
};

export async function executeCapability(
  toolId: LocalToolExecutionRequest['toolId'],
  capabilityId: string,
  args: NonNullable<LocalToolExecutionRequest['args']>,
): Promise<LocalToolExecutionResult> {
  const key = `${toolId}.${capabilityId}`;
  const executor = EXECUTORS[key];
  if (!executor) {
    logger.info('No executor implemented yet', { key });
    return {
      success: false,
      notImplemented: true,
      error: `Action ${key} is approved but no executor is wired up yet.`,
    };
  }
  try {
    return await executor(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Executor failed', { key, message });
    return { success: false, error: message };
  }
}
