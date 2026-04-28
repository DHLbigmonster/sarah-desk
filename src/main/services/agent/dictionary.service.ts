import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log';

const logger = log.scope('dictionary');

interface DictionaryEntry {
  from: string;
  to: string;
}

interface DictionaryFile {
  replacements: DictionaryEntry[];
}

const DICT_DIR = path.join(os.homedir(), '.config', 'sarah-desk');
const DICT_FILE = path.join(DICT_DIR, 'dictionary.json');

const DEFAULT_ENTRIES: DictionaryEntry[] = [
  { from: 'open claw', to: 'OpenClaw' },
  { from: 'openclaw', to: 'OpenClaw' },
  { from: '火山引擎', to: '火山引擎' }, // identity — keeps it consistent
  { from: 'typeless', to: 'Typeless' },
  { from: 'volcengine', to: 'Volcengine' },
];

export class DictionaryService {
  private entries: DictionaryEntry[] = [];
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!fs.existsSync(DICT_FILE)) {
      // Create default dictionary on first run
      fs.mkdirSync(DICT_DIR, { recursive: true });
      fs.writeFileSync(DICT_FILE, JSON.stringify({ replacements: DEFAULT_ENTRIES }, null, 2), 'utf-8');
      this.entries = [...DEFAULT_ENTRIES];
      logger.info('Created default dictionary', { path: DICT_FILE });
      return;
    }

    try {
      const raw = fs.readFileSync(DICT_FILE, 'utf-8');
      const data = JSON.parse(raw) as DictionaryFile;
      this.entries = Array.isArray(data.replacements) ? data.replacements : [];
      logger.info('Dictionary loaded', { entries: this.entries.length });
    } catch (err) {
      logger.warn('Failed to load dictionary, using defaults', { err });
      this.entries = [...DEFAULT_ENTRIES];
    }
  }

  /** Apply all replacements to transcript text (case-insensitive, word-boundary aware) */
  apply(text: string): string {
    this.load();
    if (this.entries.length === 0) return text;

    let result = text;
    for (const entry of this.entries) {
      // Case-insensitive replacement, preserve surrounding whitespace
      const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'gi');
      result = result.replace(re, entry.to);
    }
    return result;
  }

  getDictPath(): string {
    return DICT_FILE;
  }
}

export const dictionaryService = new DictionaryService();
