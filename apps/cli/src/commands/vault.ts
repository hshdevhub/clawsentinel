import { Command } from 'commander';
import { vault } from '@clawsentinel/clawvault';

export function vaultCommand(): Command {
  const cmd = new Command('vault')
    .description('Manage credentials in ClawVault (encrypted credential store)');

  // vault list
  cmd.command('list')
    .description('List all stored credentials (names and metadata only — not values)')
    .action(async () => {
      await vault.init();
      const entries = vault.list();

      if (entries.length === 0) {
        console.log('[ClawVault] No credentials stored yet.');
        console.log('  Add one: clawsentinel vault set <name> <value>');
        return;
      }

      console.log('[ClawVault] Stored credentials:');
      console.log('  ─────────────────────────────────────────────');
      for (const entry of entries) {
        console.log(`  ${entry.name}`);
        console.log(`    Reference:  ${entry.reference}`);
        console.log(`    Endpoints:  ${entry.allowedEndpoints.join(', ')}`);
        console.log(`    Stored at:  ${entry.createdAt}`);
      }
      console.log('  ─────────────────────────────────────────────');
    });

  // vault set
  cmd.command('set <name> <value>')
    .description('Store a credential in ClawVault')
    .option('-e, --endpoint <url>', 'Allowed endpoint (can be specified multiple times)', collectEndpoints, [])
    .action(async (name: string, value: string, options: { endpoint: string[] }) => {
      await vault.init();

      // Default endpoints per credential name
      const defaultEndpoints: Record<string, string[]> = {
        anthropic: ['https://api.anthropic.com'],
        openai: ['https://api.openai.com'],
        gemini: ['https://generativelanguage.googleapis.com'],
        google: ['https://generativelanguage.googleapis.com']
      };

      const endpoints = options.endpoint.length > 0
        ? options.endpoint
        : defaultEndpoints[name.toLowerCase()] ?? [];

      if (endpoints.length === 0) {
        console.error(`  ✗ No allowed endpoints specified. Use --endpoint <url>`);
        console.error(`    Example: clawsentinel vault set ${name} <value> --endpoint https://api.example.com`);
        process.exit(1);
      }

      vault.set(name, value, endpoints);
      console.log(`  ✓ Credential "${name}" stored in ClawVault`);
      console.log(`    Allowed endpoints: ${endpoints.join(', ')}`);
      console.log(`    Reference: @vault:${name}`);
    });

  // vault delete
  cmd.command('delete <name>')
    .description('Delete a credential from ClawVault')
    .action(async (name: string) => {
      await vault.init();
      const deleted = vault.delete(name);
      if (deleted) {
        console.log(`  ✓ Credential "${name}" deleted from ClawVault`);
      } else {
        console.error(`  ✗ Credential "${name}" not found`);
        process.exit(1);
      }
    });

  return cmd;
}

function collectEndpoints(value: string, previous: string[]): string[] {
  return [...previous, value];
}
