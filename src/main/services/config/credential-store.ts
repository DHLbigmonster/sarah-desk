/**
 * Encrypted credential storage using Electron's safeStorage.
 *
 * Credentials are stored in app.getPath('userData')/credentials.json.
 * Values are encrypted via safeStorage.encryptString() → base64.
 * Falls back to plaintext JSON if safeStorage is unavailable.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';

const logger = log.scope('credential-store');

const CREDENTIALS_FILENAME = 'credentials.json';

function getCredentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIALS_FILENAME);
}

function readRawFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getCredentialsPath(), 'utf8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeRawFile(data: Record<string, string>): void {
  const filePath = getCredentialsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value);
    return encrypted.toString('base64');
  }
  // Fallback: store plaintext with a prefix to distinguish
  return `plain:${value}`;
}

function decryptValue(stored: string): string {
  if (stored.startsWith('plain:')) {
    return stored.slice(6);
  }
  if (safeStorage.isEncryptionAvailable()) {
    const buf = Buffer.from(stored, 'base64');
    return safeStorage.decryptString(buf);
  }
  // Can't decrypt — return as-is (shouldn't happen in practice)
  logger.warn('safeStorage unavailable, returning raw value');
  return stored;
}

export const credentialStore = {
  get(key: string): string | undefined {
    const raw = readRawFile();
    const stored = raw[key];
    if (stored == null) return undefined;
    try {
      return decryptValue(stored);
    } catch (err) {
      logger.warn('Failed to decrypt credential', { key, error: String(err) });
      return undefined;
    }
  },

  set(key: string, value: string): void {
    const raw = readRawFile();
    raw[key] = encryptValue(value);
    writeRawFile(raw);
    logger.info('Credential saved', { key });
  },

  remove(key: string): void {
    const raw = readRawFile();
    if (key in raw) {
      delete raw[key];
      writeRawFile(raw);
      logger.info('Credential removed', { key });
    }
  },

  getAll(): Record<string, string> {
    const raw = readRawFile();
    const result: Record<string, string> = {};
    for (const [key, stored] of Object.entries(raw)) {
      try {
        result[key] = decryptValue(stored);
      } catch (err) {
        logger.warn('Failed to decrypt credential in getAll', { key, error: String(err) });
      }
    }
    return result;
  },
};
