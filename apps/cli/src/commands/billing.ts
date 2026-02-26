// clawsentinel billing status  — show current plan
// clawsentinel billing portal  — open Stripe billing portal
// clawsentinel upgrade          — open Stripe checkout (7-day trial)

import { Command } from 'commander';
import { execSync } from 'child_process';
import { readPlan, hoursUntilExpiry } from '@clawsentinel/core';

const API_BASE = process.env['CLAWSENTINEL_API_URL'] ?? 'https://api.clawsentinel.dev';

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function openBrowser(url: string): void {
  try {
    const p = process.platform;
    if (p === 'darwin')  execSync(`open "${url}"`);
    else if (p === 'win32') execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    console.log(`  ${c.dim('Open this URL in your browser:')}`);
    console.log(`  ${c.cyan(url)}`);
  }
}

export function billingCommand(): Command {
  const cmd = new Command('billing')
    .description('View plan status or open billing portal');

  // ── status ────────────────────────────────────────────────────────────────
  cmd.command('status')
    .description('Show current plan and subscription status')
    .action(() => {
      const plan  = readPlan();
      const hours = hoursUntilExpiry();
      console.log('');
      console.log(`  ${c.bold('ClawSentinel — Billing')}`);
      console.log('');

      if (plan.plan === 'pro') {
        console.log(`  ${c.green('●')}  Plan:    ${c.bold('Pro')} ${c.dim('— $9/month')}`);
        if (plan.email)    console.log(`  ${c.dim('○')}  Account: ${c.dim(plan.email)}`);
        console.log(`  ${c.dim('○')}  Token:   valid for ${c.dim(`~${hours}h`)} ${c.dim('(auto-renews daily)')}`);
        console.log('');
        console.log(`  ${c.dim('To manage subscription (cancel / update card):')}`);
        console.log(`  ${c.dim('Run')} ${c.cyan('clawsentinel billing portal')}`);
      } else {
        console.log(`  ${c.dim('○')}  Plan: Free`);
        console.log('');
        console.log(`  ${c.dim('Upgrade to Pro ($9/mo) to unlock:')}`);
        console.log(`  ${c.dim('•')} Semantic engine — LLM injection detection`);
        console.log(`  ${c.dim('•')} ClawEye correlation engine`);
        console.log(`  ${c.dim('•')} Telegram + desktop alerts`);
        console.log(`  ${c.dim('•')} ClawBox Docker hardening`);
        console.log('');
        console.log(`  ${c.cyan('clawsentinel upgrade')}  ${c.dim('→ 7-day free trial, then $9/mo')}`);
      }
      console.log('');
    });

  // ── portal ────────────────────────────────────────────────────────────────
  cmd.command('portal')
    .description('Open Stripe billing portal (cancel, update card, view invoices)')
    .action(() => {
      console.log('  Opening Stripe billing portal...');
      openBrowser('https://billing.stripe.com');
    });

  return cmd;
}

export function upgradeCommand(): Command {
  return new Command('upgrade')
    .description('Upgrade to ClawSentinel Pro — 7-day free trial, then $9/month')
    .action(() => {
      const plan = readPlan();
      console.log('');

      if (plan.plan === 'pro') {
        console.log(`  You're already on ClawSentinel ${c.bold('Pro')}.`);
        console.log(`  ${c.dim('Manage subscription:')} ${c.cyan('clawsentinel billing portal')}`);
        console.log('');
        return;
      }

      console.log(`  ${c.bold('ClawSentinel Pro')}`);
      console.log(`  ${c.dim('7-day free trial — then $9/month. Cancel anytime.')}`);
      console.log('');
      console.log('  Opening checkout...');

      openBrowser(`${API_BASE}/api/checkout`);

      console.log('');
      console.log(`  ${c.dim('After checkout, check your email for the activation key.')}`);
      console.log(`  ${c.dim('Then run:')} ${c.cyan('clawsentinel activate <key>')}`);
      console.log('');
    });
}
