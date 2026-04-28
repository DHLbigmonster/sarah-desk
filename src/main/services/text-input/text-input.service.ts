/**
 * Text Input Service.
 * Inserts text at cursor position using native keyboard simulation.
 *
 * Uses @xitanggg/node-insert-text which leverages macOS CGEventKeyboardSetUnicodeString
 * to simulate typing without polluting the clipboard.
 */

import { insertText } from '@xitanggg/node-insert-text';
import { systemPreferences, shell } from 'electron';
import log from 'electron-log';

const logger = log.scope('text-input-service');

/**
 * Result of a text insertion operation.
 */
export interface TextInsertResult {
  success: boolean;
  error?: string;
}

/**
 * Text Input Service for inserting text at cursor position.
 *
 * Uses native keyboard simulation to insert text without clipboard pollution.
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
      return { success: true }; // Empty text is a no-op
    }

    // Check permission first
    if (!this.checkPermission()) {
      logger.warn('Accessibility permission not granted');
      return {
        success: false,
        error: 'Accessibility permission required. Please enable in System Settings.',
      };
    }

    try {
      logger.debug('Inserting text', { length: text.length });
      insertText(text);
      logger.info('Text inserted successfully', { length: text.length });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to insert text', { error: message });
      return { success: false, error: message };
    }
  }
}

/**
 * Singleton instance of the text input service.
 */
export const textInputService = new TextInputService();
