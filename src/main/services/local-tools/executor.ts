import { shell } from 'electron';
import log from 'electron-log';
import type {
  LocalToolExecutionRequest,
  LocalToolExecutionResult,
} from '../../../shared/types/local-tools';

const logger = log.scope('local-tools:executor');

type Executor = (
  args: NonNullable<LocalToolExecutionRequest['args']>,
) => Promise<LocalToolExecutionResult>;

const EXECUTORS: Record<string, Executor> = {
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
