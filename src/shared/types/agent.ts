/**
 * Agent type definitions.
 * Used by both main process and renderer process.
 */

/**
 * Context captured from the current screen at hotkey press time.
 */
export interface AgentContext {
  /** Frontmost app name, e.g. "Google Chrome" */
  appName: string;
  /** Window title of the frontmost app */
  windowTitle: string;
  /** Current URL if the frontmost app is a browser */
  url?: string;
  /** Path to screenshot PNG saved to temp directory */
  screenshotPath?: string;
}

/**
 * A single message in the agent chat session.
 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** True while the assistant is still streaming this message */
  isStreaming?: boolean;
}

/**
 * Agent status states.
 * - idle: Not active
 * - capturing: Gathering screen context
 * - waiting: Window open, waiting for user input
 * - thinking: Sent to Claude, waiting for first token
 * - streaming: Receiving streaming response
 * - done: Turn complete
 * - error: Something went wrong
 */
export type AgentStatus =
  | 'idle'
  | 'capturing'
  | 'waiting'
  | 'thinking'
  | 'streaming'
  | 'done'
  | 'error';

/**
 * A streamed chunk of the agent response.
 */
export interface AgentStreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error';
  text?: string;
  toolName?: string;
  error?: string;
}

/**
 * Payload sent from main to renderer when context is ready and window opens.
 */
export interface AgentContextReadyPayload {
  context: AgentContext;
}

/**
 * A condensed summary of one day's agent conversations.
 * Generated automatically at day-start by the consolidation service.
 */
export interface DailySummary {
  /** ISO date string, e.g. "2025-06-01" */
  date: string;
  /** One-paragraph summary produced by the claude CLI */
  summary: string;
  /** Number of user turns in the original session */
  turnCount: number;
  /** Unix timestamp when this summary was created */
  createdAt: number;
}

/**
 * Persisted form of a single day's chat session.
 * Written to ~/.feishu-agent/sessions/YYYY-MM-DD.json.
 */
export interface PersistedSession {
  date: string;
  messages: AgentMessage[];
  savedAt: number;
}
