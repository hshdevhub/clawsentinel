// clawsentinel activate <token>
// Exchanges a refresh_token for a 24h access_token (JWT)
// Locks the token to this machine via machine_id fingerprint

import { Command } from 'commander';
import { writePlan, getMachineId } from '@clawsentinel/core';

const API_BASE = process.env['CLAWSENTINEL_API_URL'] ?? 'https://api.clawsentinel.dev';

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export function activateCommand(): Command {
  return new Command('activate')
    .description('Activate ClawSentinel Pro with your activation key')
    .argument('<token>', 'Activation key received by email after subscribing')
    .action(async (token: string) => {
      console.log('');
      process.stdout.write(`  Activating ClawSentinel Pro...`);

      const machineId = getMachineId();
      let response: Response;

      try {
        response = await fetch(`${API_BASE}/api/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: token.trim(), machine_id: machineId })
        });
      } catch (err) {
        console.log('');
        console.error(`\n  ${c.red('✗')}  Cannot reach activation server.`);
        console.error(`  ${c.dim('Check your internet connection and try again.')}`);
        console.error(`  ${c.dim('Error:')} ${c.dim(String(err))}`);
        process.exit(1);
      }

      if (!response.ok) {
        console.log('');
        const body = await response.json().catch(() => ({})) as { error?: string };
        const msg = body.error ?? `HTTP ${response.status}`;

        if (response.status === 401) {
          console.error(`\n  ${c.red('✗')}  ${msg}`);
          console.error(`  ${c.dim('Check your email for the correct key.')}`);
          console.error(`  ${c.dim('To resubscribe:')} ${c.cyan('clawsentinel upgrade')}`);
        } else {
          console.error(`\n  ${c.red('✗')}  Activation failed: ${msg}`);
        }
        process.exit(1);
      }

      const data = await response.json() as { access_token: string; plan: string; email: string };

      writePlan({
        plan:          'pro',
        email:         data.email,
        access_token:  data.access_token,
        refresh_token: token.trim()
      });

      console.log(` ${c.green('done')}`);
      console.log('');
      console.log(`  ${c.green('✓')}  ${c.bold('ClawSentinel Pro activated!')}`);
      console.log(`  ${c.dim('Plan:')}    ${c.cyan('Pro')}`);
      console.log(`  ${c.dim('Account:')} ${c.dim(data.email)}`);
      console.log('');
      console.log(`  ${c.dim('Pro features now active:')}`);
      console.log(`  ${c.dim('•')} Semantic engine — LLM-assisted injection detection`);
      console.log(`  ${c.dim('•')} ClawEye correlation engine`);
      console.log(`  ${c.dim('•')} Telegram + desktop alerts`);
      console.log(`  ${c.dim('•')} ClawBox Docker hardening`);
      console.log('');
      console.log(`  ${c.dim('Restart to apply:')} ${c.cyan('clawsentinel stop && clawsentinel start')}`);
      console.log('');
    });
}
