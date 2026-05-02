export type LocalToolId = 'openclaw' | 'obsidian' | 'lark-cli';

export type LocalToolCategory = 'agent' | 'knowledge' | 'productivity';

export type LocalToolHealth = 'ready' | 'needs_setup' | 'missing' | 'unknown';

export type LocalToolAuthState = 'not_required' | 'authenticated' | 'needs_auth' | 'unknown';

export type LocalToolRisk = 'read' | 'write' | 'external' | 'sensitive';

export interface LocalToolCapability {
  id: string;
  label: string;
  description: string;
  risk: LocalToolRisk;
  enabled: boolean;
  requiresConsent: boolean;
  commandHint: string | null;
}

export interface LocalToolStatus {
  id: LocalToolId;
  name: string;
  category: LocalToolCategory;
  description: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  authState: LocalToolAuthState;
  health: LocalToolHealth;
  detail: string;
  setupHint: string | null;
  docsUrl: string | null;
  capabilities: LocalToolCapability[];
  signals: Record<string, string | number | boolean | null>;
  checkedAt: number;
}

export interface LocalToolsSnapshot {
  checkedAt: number;
  ready: number;
  needsSetup: number;
  missing: number;
  tools: LocalToolStatus[];
}
