export type ModuleName = 'clawguard' | 'clawvault' | 'clawhub-scanner' | 'clawbox' | 'claweye';

export type ModuleStatus = 'running' | 'stopped' | 'error' | 'disabled' | 'initializing';

export interface ModuleHealth {
  name: ModuleName;
  status: ModuleStatus;
  version: string;
  startedAt?: string;
  lastEventAt?: string;
  errorMessage?: string;
  stats: Record<string, number | string>;
}

export interface SystemHealth {
  version: string;
  uptime: number;
  modules: ModuleHealth[];
  securityScore: number;
  eventsLast24h: number;
  blocksLast24h: number;
}
