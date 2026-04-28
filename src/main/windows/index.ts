/**
 * Window management module.
 * Re-exports all window managers for convenient importing.
 */

export { FloatingWindowManager, floatingWindow } from './floating';
export { AgentWindowManager, agentWindow } from './agent';
export { ClawDeskMainWindowManager, clawDeskMainWindow, setQuitting } from './claw-desk';
export { MiniSettingsWindowManager, miniSettingsWindow } from './mini-settings';
