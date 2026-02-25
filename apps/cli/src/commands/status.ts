import { Command } from 'commander';
import { getDb, config } from '@clawsentinel/core';

const MODULE_ICONS: Record<string, string> = {
  running: '✓',
  stopped: '○',
  error: '✗',
  disabled: '-',
  initializing: '◌'
};

export function statusCommand(): Command {
  return new Command('status')
    .description('Show health status of all 5 ClawSentinel modules')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const cfg = config.load();

      const modules = [
        {
          name: 'ClawGuard',
          id: 'clawguard',
          description: 'WebSocket + HTTP proxy, injection firewall',
          port: cfg.proxy.listenPort,
          enabled: cfg.modules.clawguard
        },
        {
          name: 'ClawVault',
          id: 'clawvault',
          description: 'Encrypted credential store',
          enabled: cfg.modules.clawvault
        },
        {
          name: 'ClawHub Scanner',
          id: 'clawhub-scanner',
          description: 'Supply chain protection, skill scanner',
          enabled: cfg.modules.clawhubScanner
        },
        {
          name: 'ClawBox',
          id: 'clawbox',
          description: 'Hardened Docker deployment',
          enabled: cfg.modules.clawbox
        },
        {
          name: 'ClawEye',
          id: 'claweye',
          description: 'Real-time security dashboard',
          port: cfg.claweye.port,
          enabled: cfg.modules.claweye
        }
      ];

      // Try to read actual status from DB if it exists
      let dbStatuses: Record<string, string> = {};
      try {
        const db = getDb();
        const rows = db.prepare('SELECT name, status FROM module_status').all() as Array<{ name: string; status: string }>;
        dbStatuses = Object.fromEntries(rows.map(r => [r.name, r.status]));
      } catch {
        // DB not yet initialized — show registered status
      }

      if (options.json) {
        console.log(JSON.stringify({ version: '0.1.0', modules, dbStatuses }, null, 2));
        return;
      }

      console.log('');
      console.log('  ClawSentinel v0.1.0 — Module Status');
      console.log('  ─────────────────────────────────────────────────');

      for (const mod of modules) {
        const rawStatus = dbStatuses[mod.id] ?? (mod.enabled ? 'stopped' : 'disabled');
        const status = rawStatus as string;
        const icon = MODULE_ICONS[status] ?? '?';
        const portStr = 'port' in mod ? ` [:${mod.port}]` : '';
        const enabledStr = mod.enabled ? '' : ' (disabled)';

        console.log(`  ${icon} ${mod.name.padEnd(20)} ${status.padEnd(14)}${portStr}${enabledStr}`);
        console.log(`    ${mod.description}`);
      }

      console.log('  ─────────────────────────────────────────────────');
      console.log('  Run: clawsentinel start   to activate all modules');
      console.log('');
    });
}
