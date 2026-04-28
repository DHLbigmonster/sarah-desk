/**
 * Context Capture Service.
 * Gathers screen context at hotkey press time:
 *   - Frontmost app name and window title (via AppleScript / osascript)
 *   - Current URL if the frontmost app is a browser (via AppleScript)
 *   - Screenshot of the primary display (via `screencapture` CLI)
 *
 * Uses execFile() instead of exec() for all external processes to avoid
 * shell-escaping issues with multi-line scripts or special characters.
 *
 * macOS-only; other platforms return safe defaults.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import log from 'electron-log';
import { memoryService } from './memory.service';
import { permissionsService } from '../permissions/permissions.service';
import type { AgentContext } from '../../../shared/types/agent';

const execFileAsync = promisify(execFile);
const logger = log.scope('context-capture-service');

/** AppleScript: returns "AppName|WindowTitle" for the frontmost app */
const GET_APP_SCRIPT = `
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  set frontTitle to ""
  try
    set frontTitle to name of first window of (first application process whose frontmost is true)
  end try
  return frontApp & "|" & frontTitle
end tell
`.trim();

/** Known browser process name keywords (lowercase) */
const BROWSER_KEYWORDS = ['chrome', 'safari', 'firefox', 'brave', 'edge', 'chromium', 'opera', 'arc'];

function isBrowser(appName: string): boolean {
  const lower = appName.toLowerCase();
  return BROWSER_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Build an AppleScript to get the current tab URL for known browsers.
 * Returns empty string for unsupported browsers.
 */
function buildUrlScript(appName: string): string {
  const lower = appName.toLowerCase();
  if (lower.includes('safari')) {
    return 'tell application "Safari" to get URL of current tab of front window';
  }
  // Chrome-family (Chrome, Brave, Edge, Chromium, Arc)
  if (
    lower.includes('chrome') ||
    lower.includes('brave') ||
    lower.includes('edge') ||
    lower.includes('chromium') ||
    lower.includes('arc')
  ) {
    return `tell application "${appName}" to get URL of active tab of front window`;
  }
  if (lower.includes('firefox')) {
    return `tell application "${appName}" to get URL of active tab of front window`;
  }
  return '';
}

/**
 * Run an AppleScript string via osascript without going through a shell.
 * Returns stdout trimmed, or throws on failure.
 */
async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script]);
  return stdout.trim();
}

export class ContextCaptureService {
  /**
   * Capture the frontmost app name and window title.
   * Returns safe defaults on failure.
   */
  async captureAppContext(): Promise<{ appName: string; windowTitle: string }> {
    if (process.platform !== 'darwin') {
      return { appName: 'Unknown', windowTitle: '' };
    }
    try {
      const result = await runAppleScript(GET_APP_SCRIPT);
      const parts = result.split('|');
      return {
        appName: parts[0]?.trim() || 'Unknown',
        windowTitle: parts[1]?.trim() || '',
      };
    } catch (err) {
      logger.warn('Failed to capture app context', { err });
      return { appName: 'Unknown', windowTitle: '' };
    }
  }

  /**
   * Capture the current URL from the frontmost browser window.
   * Returns undefined if the app is not a recognized browser or on failure.
   */
  async captureUrl(appName: string): Promise<string | undefined> {
    if (process.platform !== 'darwin' || !isBrowser(appName)) {
      return undefined;
    }
    const script = buildUrlScript(appName);
    if (!script) return undefined;
    try {
      const url = await runAppleScript(script);
      return url || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Take a screenshot of the primary display using `screencapture -x`
   * (silent capture, no shutter sound). Returns the saved PNG path.
   *
   * Skips silently when Screen Recording permission is not granted,
   * to avoid triggering the system permission prompt every time the
   * user invokes Command mode.
   */
  async captureScreenshot(): Promise<string | undefined> {
    if (process.platform !== 'darwin') {
      return undefined;
    }
    const screenStatus = permissionsService.getScreenRecordingStatus();
    if (screenStatus !== 'granted') {
      logger.info('Skipping screenshot — Screen Recording permission not granted', { status: screenStatus });
      return undefined;
    }
    try {
      // Rotate: keep only last 10 screenshots
      memoryService.rotateScreenshots(10);

      const timestamp = Date.now();
      const screenshotPath = path.join(memoryService.screenshotsDir, `screen-${timestamp}.png`);
      // -x = no sound, -C = capture cursor too (optional), -m = main display only
      await execFileAsync('screencapture', ['-x', '-m', screenshotPath]);
      return screenshotPath;
    } catch (err) {
      logger.warn('Failed to capture screenshot', { err });
      return undefined;
    }
  }

  /**
   * Capture the full context (app + URL + screenshot) in a single call.
   * App context and screenshot are captured in parallel.
   */
  async capture(): Promise<AgentContext> {
    const [appResult, screenshotPath] = await Promise.all([
      this.captureAppContext(),
      this.captureScreenshot(),
    ]);

    const { appName, windowTitle } = appResult;
    const url = await this.captureUrl(appName);

    const context: AgentContext = {
      appName,
      windowTitle,
      ...(url ? { url } : {}),
      ...(screenshotPath ? { screenshotPath } : {}),
    };

    logger.info('Context captured', {
      appName,
      windowTitle,
      hasUrl: !!url,
      hasScreenshot: !!screenshotPath,
    });
    return context;
  }
}

export const contextCaptureService = new ContextCaptureService();
