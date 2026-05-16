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
import fs from 'node:fs';
import { app } from 'electron';
import log from 'electron-log';
import { memoryService } from './memory.service';
import { permissionsService } from '../permissions/permissions.service';
import type { AgentContext } from '../../../shared/types/agent';

const execFileAsync = promisify(execFile);
const logger = log.scope('context-capture-service');
const OCR_COMPILE_TIMEOUT_MS = 15_000;
const OCR_TIMEOUT_MS = 12_000;
const OCR_BINARY_PATH = path.join(process.env.HOME ?? process.cwd(), '.sarah', 'ocr-image');

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

function resolveOcrScriptPath(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'scripts', 'ocr-image.swift'),
    path.join(process.cwd(), 'scripts', 'ocr-image.swift'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function resolveOcrBinary(scriptPath: string): Promise<string> {
  try {
    memoryService.ensureDirectories();
    const scriptStat = fs.statSync(scriptPath);
    const binaryStat = fs.existsSync(OCR_BINARY_PATH) ? fs.statSync(OCR_BINARY_PATH) : null;
    if (binaryStat && binaryStat.mtimeMs >= scriptStat.mtimeMs && binaryStat.size > 0) {
      return OCR_BINARY_PATH;
    }
    await execFileAsync('/usr/bin/swiftc', ['-O', scriptPath, '-o', OCR_BINARY_PATH], {
      timeout: OCR_COMPILE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return OCR_BINARY_PATH;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('OCR binary compile failed; falling back to swift interpreter', { error: message });
    return '/usr/bin/swift';
  }
}

function trimOcrText(text: string): string | undefined {
  const normalized = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!normalized) return undefined;
  return normalized.length > 6000 ? `${normalized.slice(0, 6000)}\n…` : normalized;
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
   * The Electron permission API can report "not-determined" even when the
   * `screencapture` CLI is already allowed. Attempt capture unless macOS
   * reports a hard denial; the command itself is the source of truth.
   */
  async captureScreenshot(): Promise<string | undefined> {
    if (process.platform !== 'darwin') {
      return undefined;
    }
    const screenStatus = permissionsService.getScreenRecordingStatus();
    if (screenStatus === 'denied' || screenStatus === 'restricted') {
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
   * Extract visible text from the screenshot using macOS Vision.
   * This makes non-browser apps such as Telegram, WeChat, Preview, and PDF
   * readers usable without pretending Sarah can access their private DOM/data.
   */
  async captureScreenshotOcr(screenshotPath: string | undefined): Promise<string | undefined> {
    if (process.platform !== 'darwin' || !screenshotPath) {
      return undefined;
    }
    if (process.env.SARAH_SCREEN_OCR === '0' || process.env.SARAH_SCREEN_OCR === 'false') {
      return undefined;
    }

    const scriptPath = resolveOcrScriptPath();
    if (!scriptPath) {
      logger.warn('OCR script not found');
      return undefined;
    }

    try {
      const ocrBinary = await resolveOcrBinary(scriptPath);
      const args = ocrBinary === '/usr/bin/swift' ? [scriptPath, screenshotPath] : [screenshotPath];
      const { stdout } = await execFileAsync(ocrBinary, args, {
        timeout: OCR_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      return trimOcrText(stdout);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Screenshot OCR failed', { error: message });
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
    const [url, ocrText] = await Promise.all([
      this.captureUrl(appName),
      this.captureScreenshotOcr(screenshotPath),
    ]);

    const context: AgentContext = {
      appName,
      windowTitle,
      ...(url ? { url } : {}),
      ...(screenshotPath ? { screenshotPath } : {}),
      ...(ocrText ? { ocrText } : {}),
    };

    logger.info('Context captured', {
      appName,
      windowTitle,
      hasUrl: !!url,
      hasScreenshot: !!screenshotPath,
      ocrChars: ocrText?.length ?? 0,
    });
    return context;
  }
}

export const contextCaptureService = new ContextCaptureService();
