export interface ClawDeskStatus {
  state: 'loading' | 'connected' | 'offline';
  endpoint: string;
  port: number;
  tokenConfigured: boolean;
  configFound: boolean;
  workspaceAvailable: boolean;
  detail: string;
  checkedAt: number;
}
