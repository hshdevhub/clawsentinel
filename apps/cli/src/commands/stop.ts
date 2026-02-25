import { Command } from 'commander';

export function stopCommand(): Command {
  return new Command('stop')
    .description('Stop all ClawSentinel modules')
    .option('-m, --module <name>', 'Stop a specific module only')
    .action((options: { module?: string }) => {
      if (options.module) {
        console.log(`[ClawSentinel] Stopping module: ${options.module}`);
        console.log(`  ⚠ Module stop (${options.module}) — available in v0.2.0`);
        return;
      }
      console.log('[ClawSentinel] Stopping all modules...');
      console.log('  ⚠  Full stop command available in v0.2.0');
    });
}
