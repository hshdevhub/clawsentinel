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

// Core modules that cannot be disabled (would break the security model)
const PROTECTED_MODULES = new Set(['clawguard', 'clawvault']);

export function disableCommand(): Command {
  return new Command('disable')
    .description('Disable a specific ClawSentinel module')
    .argument('<module>', 'Module to disable (clawguard|clawvault|clawhub-scanner|clawbox|claweye)')
    .option('--force', 'Force disable even protected modules (not recommended)')
    .action((moduleName: string, options: { force?: boolean }) => {
      const normalizedName = moduleName.toLowerCase();
      const configKey = MODULE_MAP[normalizedName];

      if (!configKey) {
        console.error(`Unknown module: ${moduleName}`);
        console.error('Available: clawguard, clawvault, clawhub-scanner, clawbox, claweye');
        process.exit(1);
      }

      if (PROTECTED_MODULES.has(normalizedName) && !options.force) {
        console.error(`  ✗ ${moduleName} is a core security module and cannot be disabled`);
        console.error(`    If you really need to: clawsentinel disable ${moduleName} --force`);
        process.exit(1);
      }

      config.setNested(`modules.${configKey}`, false);
      console.log(`  ✓ ${moduleName} disabled`);

      if (PROTECTED_MODULES.has(normalizedName)) {
        console.log('  ⚠  WARNING: Disabling a core module reduces your security coverage');
      }

      console.log('    Restart with: clawsentinel start');
    });
}
