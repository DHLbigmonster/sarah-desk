/**
 * Agent IPC handlers.
 * Wires up IPC channels to AgentService, AgentWindowManager, MemoryService,
 * and ConsolidationService.
 *
 * Event forwarding strategy: register permanent listeners on agentService
 * ONCE at startup (not per-instruction). This avoids accumulation bugs where
 * a second instruction arriving before the first completes would prematurely
 * clean up the new instruction's listeners.
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { agentService, memoryService, consolidationService } from '../services/agent';
import { agentWindow, floatingWindow } from '../windows';
import type { AgentMessage } from '../../shared/types/agent';

const logger = log.scope('agent-handler');

/**
 * Register all agent IPC handlers.
 * Must be called once at app startup.
 */
export function setupAgentHandlers(): void {
  // ── Permanent event forwarding (registered once, never removed) ──────────
  agentService.on('chunk', (chunk: { type: string; text?: string; toolName?: string }) => {
    const typed = chunk as Parameters<typeof agentWindow.sendChunk>[0];
    agentWindow.sendChunk(typed);
  });

  agentService.on('done', () => {
    agentWindow.sendDone();
  });

  agentService.on('error', (message: string) => {
    agentWindow.sendError(message);
  });

  // ── Answer overlay first chunk notification ──────────────────────────────
  ipcMain.on(IPC_CHANNELS.AGENT.FIRST_CHUNK_VISIBLE, () => {
    floatingWindow.allowHide();
  });

  // ── Consolidation: summarise yesterday's session in the background ────────
  consolidationService.onSummaryReady((summary) => {
    agentWindow.sendDailySummaryReady(summary);
    logger.info('Daily summary forwarded to renderer', { date: summary.date });
  });

  // Trigger after a short delay so the main window can finish initialising,
  // then keep a local-midnight scheduler alive for long-running app sessions.
  setTimeout(() => {
    consolidationService.startScheduler();
  }, 3000);

  // ── Renderer → Main: hide the agent window ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AGENT.HIDE, () => {
    agentService.abort();
    agentWindow.hide();
    floatingWindow.forceHide();
    return { success: true };
  });

  // ── Renderer → Main: user sends an instruction ───────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AGENT.SEND_INSTRUCTION,
    async (
      _event,
      payload: {
        instruction: string;
        context: {
          appName: string;
          windowTitle: string;
          url?: string;
          screenshotPath?: string;
          ocrText?: string;
        };
      },
    ) => {
      const { instruction, context } = payload;
      logger.info('Received instruction', { instruction: instruction.slice(0, 80) });

      agentService.execute(instruction, context).catch((err: Error) => {
        logger.error('AgentService.execute threw', { err: err.message });
      });

      return { success: true };
    },
  );

  // ── Renderer → Main: abort current agent task ────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AGENT.ABORT, () => {
    agentService.abort();
    return { success: true };
  });

  // ── Renderer → Main: save today's session messages ───────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AGENT.SAVE_SESSION,
    (_event, messages: AgentMessage[]) => {
      try {
        memoryService.saveSession(messages);
      } catch (err) {
        logger.warn('Failed to save session', { err });
      }
      return { success: true };
    },
  );

  // ── Renderer → Main: load today's persisted session ──────────────────────
  ipcMain.handle(IPC_CHANNELS.AGENT.GET_TODAY_SESSION, () => {
    return memoryService.loadTodaySession();
  });

  // ── Renderer → Main: get all daily summaries ─────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AGENT.GET_DAILY_SUMMARIES, () => {
    return memoryService.getDailySummaries();
  });

  logger.info('Agent IPC handlers registered');
}
