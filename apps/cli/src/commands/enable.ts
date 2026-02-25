import { Command } from 'commander';
import { config } from '@clawsentinel/core';
import type { ClawSentinelConfig } from '@clawsentinel/core';

const MODULE_MAP: Record<string, keyof ClawSentinelConfig['modules']> = {
  'clawguard': 'clawguard',
  'clawvault': 'clawvault',
  'clawhub-scanner': 'clawhubScanner',
  'clawhub': 'clawhubScanner',
  'clawbox': 'clawbox',
  'claweye': 'claweye'
};

export function enableCommand(): Command {
  return new Command('enable')
    .description('Enable a specific ClawSentinel module')
    .argument('<module>', 'Module to enable (clawguard|clawvault|clawhub-scanner|clawbox|claweye)')
    .action((moduleName: string) => {
      const configKey = MODULE_MAP[moduleName.toLowerCase()];
      if (!configKey) {
        console.error(`Unknown module: ${moduleName}`);
        console.error('Available: clawguard, clawvault, clawhub-scanner, clawbox, claweye');
        process.exit(1);
      }

      const modules = config.get('modules');
      if (modules[configKey]) {
        console.log(`  ℹ  ${moduleName} is already enabled`);
        return;
      }

      config.setNested(`modules.${configKey}`, true);
      console.log(`  ✓ ${moduleName} enabled`);
      console.log(`    Restart with: clawsentinel start`);
    });
}
