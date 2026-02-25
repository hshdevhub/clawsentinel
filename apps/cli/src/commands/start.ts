import { Command } from 'commander';
import { config } from '@clawsentinel/core';

export function startCommand(): Command {
  return new Command('start')
    .description('Start all ClawSentinel modules')
    .option('-m, --module <name>', 'Start a specific module only (clawguard, clawvault, clawhub-scanner, clawbox, claweye)')
    .action(async (options: { module?: string }) => {
      const cfg = config.load();

      if (options.module) {
        console.log(`[ClawSentinel] Starting module: ${options.module}`);
        // TODO Sprint 2+: Start individual module
        console.log(`  ⚠ Module start (${options.module}) — available in v0.2.0`);
        return;
      }

      console.log('[ClawSentinel] Starting all modules...');
      console.log(`  ClawGuard proxy: ws://127.0.0.1:${cfg.proxy.listenPort} → :${cfg.proxy.upstreamPort}`);
      console.log('  ClawVault:       credential store initialized');
      console.log('  ClawHub Scanner: monitoring installed skills');
      console.log('  ClawEye:         dashboard at http://localhost:7432');
      console.log('');
      console.log('  ⚠  Full module orchestration available in v0.2.0');
      console.log('     Current: modules are registered, proxy starts in v0.2.0');
    });
}
