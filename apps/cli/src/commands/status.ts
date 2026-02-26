import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb, config } from '@clawsentinel/core';

const RUN_DIR = path.join(os.homedir(), '.clawsentinel', 'run');

function isPidRunning(name: string): boolean {
  try {
    const pid = parseInt(fs.readFileSync(path.join(RUN_DIR, `${name}.pid`), 'utf8').trim(), 10);
    process.kill(pid, 0); // throws ESRCH if process doesn't exist
    return true;
  } catch {
    return false;
  }
}

const VERSION = '0.7.0';

// Inline ANSI helpers (no ESM-only deps needed for status)
const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  grey:   (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};

type ModuleStatus = 'running' | 'stopped' | 'error' | 'disabled' | 'initializing';

function statusDot(status: ModuleStatus): string {
  switch (status) {
    case 'running':      return c.green('●');
    case 'error':        return c.red('●');
    case 'initializing': return c.yellow('◌');
    case 'stopped':      return c.yellow('○');
    case 'disabled':     return c.grey('○');
    default:             return c.grey('?');
  }
}

function statusLabel(status: ModuleStatus): string {
  switch (status) {
    case 'running':      return c.green('running');
    case 'error':        return c.red('error');
    case 'initializing': return c.yellow('starting');
    case 'stopped':      return c.yellow('stopped');
    case 'disabled':     return c.grey('disabled');
    default:             return c.grey(status);
  }
}

export function statusCommand(): Command {
  return new Command('status')
    .description('Show health status of all 5 ClawSentinel modules')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const cfg = config.load();

      const modules = [
        {
          name: 'ClawBox',
          id:   'clawbox',
          icon: '🐳',
          description: 'Hardened Docker deployment',
          enabled: cfg.modules.clawbox,
          port: undefined as number | undefined,
        },
        {
          name: 'ClawHub Scanner',
          id:   'clawhub-scanner',
          icon: '🔍',
          description: 'Supply chain protection, skill scanner',
          enabled: cfg.modules.clawhubScanner,
          port: undefined as number | undefined,
        },
        {
          name: 'ClawVault',
          id:   'clawvault',
          icon: '🔐',
          description: 'Encrypted credential store (AES-256 + OS keychain)',
          enabled: cfg.modules.clawvault,
          port: undefined as number | undefined,
        },
        {
          name: 'ClawGuard',
          id:   'clawguard',
          icon: '🛡',
          description: 'WebSocket + HTTP proxy, 500-rule injection firewall',
          enabled: cfg.modules.clawguard,
          port: cfg.proxy.listenPort,
        },
        {
          name: 'ClawEye',
          id:   'claweye',
          icon: '👁',
          description: 'Real-time security dashboard + correlation engine',
          enabled: cfg.modules.claweye,
          port: cfg.claweye.port,
        },
      ];

      // Try to read actual status from DB
      let dbStatuses: Record<string, string> = {};
      try {
        const db = getDb();
        const rows = db.prepare('SELECT name, status FROM module_status').all() as Array<{ name: string; status: string }>;
        dbStatuses = Object.fromEntries(rows.map(r => [r.name, r.status]));
      } catch {
        // DB not yet initialised — show config-derived status
      }

      if (options.json) {
        const out = modules.map(m => ({
          id:          m.id,
          name:        m.name,
          status:      dbStatuses[m.id] ?? (m.enabled ? 'stopped' : 'disabled'),
          port:        m.port ?? null,
          enabled:     m.enabled,
          description: m.description,
        }));
        console.log(JSON.stringify({ version: VERSION, plan: 'free', modules: out }, null, 2));
        return;
      }

      const now = new Date().toLocaleTimeString();
      console.log('');
      console.log(`  ${c.bold(`ClawSentinel v${VERSION}`)}  ${c.dim(`· Free Plan · ${now}`)}`);
      console.log(`  ${c.grey('─'.repeat(54))}`);

      // ClawGuard running state — source of truth for in-process modules
      const guardRunning = dbStatuses['clawguard'] === 'running' || isPidRunning('clawguard');

      for (const mod of modules) {
        // ClawVault and ClawHub Scanner run inside the ClawGuard process
        const inferredFromGuard = (mod.id === 'clawvault' || mod.id === 'clawhub-scanner') && guardRunning;
        // ClawEye: Next.js doesn't write to DB, check PID file directly
        const eyeRunning = mod.id === 'claweye' && isPidRunning('claweye');

        const rawStatus = (
          inferredFromGuard ? 'running'
          : eyeRunning ? 'running'
          : dbStatuses[mod.id] ?? (mod.enabled ? 'stopped' : 'disabled')
        ) as ModuleStatus;
        const dot   = statusDot(rawStatus);
        const label = statusLabel(rawStatus).padEnd(rawStatus === 'disabled' ? 15 : 14 + (rawStatus === 'running' ? 0 : 0));
        const portStr = mod.port != null ? c.dim(` :${mod.port}`) : '';

        console.log(`  ${dot}  ${c.bold(mod.name.padEnd(18))}  ${label.padEnd(20)}${portStr}`);
        console.log(`     ${c.dim(mod.description)}`);
      }

      console.log(`  ${c.grey('─'.repeat(54))}`);

      // Quick hint based on overall state
      const allStopped = modules.every(m => {
        const s = dbStatuses[m.id] ?? (m.enabled ? 'stopped' : 'disabled');
        return s === 'stopped' || s === 'disabled';
      });
      const anyError = modules.some(m => dbStatuses[m.id] === 'error');

      if (anyError) {
        console.log(`  ${c.red('⚠')}  One or more modules encountered an error. Run ${c.cyan('clawsentinel logs')} to investigate.`);
      } else if (allStopped) {
        console.log(`  ${c.dim('Run')} ${c.cyan('clawsentinel start')} ${c.dim('to activate all modules')}`);
      } else {
        console.log(`  ${c.dim('Run')} ${c.cyan('clawsentinel logs')} ${c.dim('to view the audit log')}`);
      }
      console.log('');
    });
}
