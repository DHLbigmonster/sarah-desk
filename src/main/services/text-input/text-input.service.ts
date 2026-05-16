/**
 * Text Input Service.
 * Inserts text at cursor position using native keyboard simulation.
 * Falls back to clipboard only when dictation has no likely text target.
 *
 * Uses @xitanggg/node-insert-text which leverages macOS CGEventKeyboardSetUnicodeString
 * to simulate typing without polluting the clipboard when direct insertion is possible.
 */

import { insertText } from '@xitanggg/node-insert-text';
import { execFileSync } from 'node:child_process';
import { clipboard, systemPreferences, shell } from 'electron';
import log from 'electron-log';

const logger = log.scope('text-input-service');

/**
 * Result of a text insertion operation.
 */
export interface TextInsertResult {
  success: boolean;
  destination: 'inserted' | 'clipboard';
  error?: string;
}

/**
 * Text Input Service for inserting text at cursor position.
 *
 * Uses native keyboard simulation to insert text without clipboard pollution when a
 * text field is focused, otherwise copies dictation to the clipboard as fallback.
 * Requires macOS Accessibility permission to function.
 *
 * @example
 * ```typescript
 * // Check permission first
 * if (!textInputService.checkPermission()) {
 *   textInputService.openPermissionSettings();
 *   return;
 * }
 *
 * // Insert text
 * const result = textInputService.insert("Hello, world!");
 * if (!result.success) {
 *   console.error(result.error);
 * }
 * ```
 */
export class TextInputService {
  /**
   * Check if Accessibility permission is granted.
   *
   * @param promptIfNeeded - If true, shows system prompt when permission is not granted
   * @returns true if permission is granted
   */
  checkPermission(promptIfNeeded = false): boolean {
    if (process.platform !== 'darwin') {
      // On non-macOS platforms, assume permission is granted
      return true;
    }

    return systemPreferences.isTrustedAccessibilityClient(promptIfNeeded);
  }

  /**
   * Open system settings to the Accessibility permission page.
   */
  openPermissionSettings(): void {
    const url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
    shell.openExternal(url).catch((error) => {
      logger.error('Failed to open accessibility settings', { error });
    });
  }

  /**
   * Insert text at the current cursor position.
   *
   * @param text - Text to insert
   * @returns Result indicating success or failure with error message
   */
  insert(text: string): TextInsertResult {
    // Validate input
    if (!text) {
      return { success: true, destination: 'inserted' }; // Empty text is a no-op
    }

    // Check permission first
    if (!this.checkPermission()) {
      logger.warn('Accessibility permission not granted');
      return this.writeToClipboard(text, 'Accessibility permission missing; copied dictation to clipboard.');
    }

    if (!this.hasLikelyTextTarget()) {
      return this.writeToClipboard(text, 'No focused text target detected; copied dictation to clipboard.');
    }

    try {
      logger.debug('Inserting text', { length: text.length });
      insertText(text);
      logger.info('Text inserted successfully', { length: text.length });
      return { success: true, destination: 'inserted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to insert text', { error: message });
      return this.writeToClipboard(text, `Text insertion failed: ${message}`);
    }
  }

  private writeToClipboard(text: string, reason: string): TextInsertResult {
    try {
      clipboard.writeText(text);
      logger.info('Dictation copied to clipboard fallback', { length: text.length, reason });
      return { success: true, destination: 'clipboard', error: reason };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to copy dictation to clipboard', { error: message });
      return { success: false, destination: 'clipboard', error: message };
    }
  }

  private hasLikelyTextTarget(): boolean {
    if (process.platform !== 'darwin') {
      return true;
    }

    try {
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set focusedElement to value of attribute "AXFocusedUIElement" of frontApp
          set roleName to ""
          set subroleName to ""
          try
            set roleName to value of attribute "AXRole" of focusedElement
          end try
          try
            set subroleName to value of attribute "AXSubrole" of focusedElement
          end try
          return roleName & "|" & subroleName
        end tell
      `;
      const output = execFileSync('/usr/bin/osascript', ['-e', script], {
        encoding: 'utf8',
        timeout: 800,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const [roleName, subroleName] = output.split('|');
      const role = roleName.toLowerCase();
      const subrole = subroleName.toLowerCase();

      return [
        'axtextfield',
        'axtextarea',
        'axcombobox',
        'axsearchfield',
      ].some((candidate) => role.includes(candidate))
        || subrole.includes('text')
        || subrole.includes('editor');
    } catch (error) {
      logger.debug('Could not determine focused text target; attempting direct insert', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }
}

/**
 * Singleton instance of the text input service.
 */
export const textInputService = new TextInputService();
