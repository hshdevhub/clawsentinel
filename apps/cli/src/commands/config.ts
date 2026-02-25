// ClawSentinel CLI — config set/get/list/reset
// Manages ~/.clawsentinel/config.json via the core ConfigManager
//
// Usage:
//   clawsentinel config list
//   clawsentinel config get clawguard.mode
//   clawsentinel config set clawguard.mode monitor
//   clawsentinel config reset

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '@clawsentinel/core';

const CONFIG_PATH = path.join(os.homedir(), '.clawsentinel', 'config.json');

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// Known config keys with descriptions
const CONFIG_DOCS: Record<string, string> = {
  'clawguard.mode':                'enforce | monitor  — enforce blocks; monitor only alerts',
  'clawguard.blockThreshold':      'Number 0-100  — score at which to block (default 71)',
  'clawguard.warnThreshold':       'Number 0-100  — score at which to warn (default 31)',
  'semanticEngine.enabled':        'true | false  — enable LLM-assisted semantic analysis',
  'semanticEngine.scoreThreshold': 'Number 0-100  — min pattern score to invoke LLM (default 30)',
  'semanticEngine.ollama.enabled': 'true | false  — use local Ollama instead of cloud LLM',
  'semanticEngine.ollama.model':   'String  — Ollama model name (default mistral)',
  'claweye.port':                  'Number  — ClawEye dashboard port (default 7432)',
  'modules.clawguard':             'true | false  — enable ClawGuard proxy',
  'modules.clawhubScanner':        'true | false  — enable ClawHub Scanner',
  'modules.claweye':               'true | false  — enable ClawEye dashboard',
  'alerts.desktop':                'true | false  — enable desktop notifications',
  'alerts.telegram.enabled':       'true | false  — enable Telegram alerts',
  'alerts.telegram.token':         'String  — Telegram bot token',
  'alerts.telegram.chatId':        'String  — Telegram chat/channel ID',
};

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let cursor: unknown = obj;
  for (const part of parts) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return c.dim('(unset)');
  if (typeof v === 'boolean') return v ? c.green('true') : c.yellow('false');
  if (typeof v === 'number') return c.cyan(String(v));
  if (typeof v === 'string') return c.cyan(`"${v}"`);
  return c.dim(JSON.stringify(v));
}

function coerceValue(raw: string, existing: unknown): unknown {
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (!isNaN(n) && raw.trim() !== '') return n;
  if (typeof existing === 'number') return n;
  return raw;
}

function askYesNo(question: string): Promise<boolean> {
  return new Promise(resolve => {
    process.stdout.write(question);
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const str = Buffer.concat(chunks).toString().trim();
      if (str.length > 0) {
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        resolve(str.toLowerCase() === 'y');
      }
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('Get, set, list, or reset ClawSentinel configuration')
    .addHelpText('after', `
Examples:
  $ clawsentinel config list
  $ clawsentinel config get clawguard.mode
  $ clawsentinel config set clawguard.mode monitor
  $ clawsentinel config set clawguard.blockThreshold 65
  $ clawsentinel config set semanticEngine.enabled false
  $ clawsentinel config reset
`);

  // ── list ───────────────────────────────────────────────────────────────────
  cmd.command('list')
    .alias('ls')
    .description('Show all current configuration values')
    .action(() => {
      const cfg = config.load() as unknown as Record<string, unknown>;
      console.log('');
      console.log(`  ${c.bold('ClawSentinel Config')}  ${c.dim(CONFIG_PATH)}`);
      console.log('');

      for (const [dotPath, doc] of Object.entries(CONFIG_DOCS)) {
        const val = getNestedValue(cfg, dotPath);
        console.log(`  ${c.dim(dotPath.padEnd(34))} ${formatValue(val)}`);
        console.log(`  ${' '.repeat(34)} ${c.dim(doc)}`);
      }
      console.log('');
    });

  // ── get ────────────────────────────────────────────────────────────────────
  cmd.command('get <key>')
    .description('Get a configuration value (dot-path, e.g. clawguard.mode)')
    .action((key: string) => {
      const cfg = config.load() as unknown as Record<string, unknown>;
      const val = getNestedValue(cfg, key);
      if (val === undefined) {
        console.error(`  ${c.red('✗')}  Unknown config key: ${key}`);
        console.error(`  ${c.dim('Run')} ${c.cyan('clawsentinel config list')} ${c.dim('to see all available keys.')}`);
        process.exitCode = 1;
        return;
      }
      if (typeof val === 'object') {
        console.log(JSON.stringify(val, null, 2));
      } else {
        console.log(String(val));
      }
    });

  // ── set ────────────────────────────────────────────────────────────────────
  cmd.command('set <key> <value>')
    .description('Set a configuration value (dot-path)')
    .action((key: string, rawValue: string) => {
      const isKnown = key in CONFIG_DOCS;
      const cfg = config.load() as unknown as Record<string, unknown>;
      const existing = getNestedValue(cfg, key);
      const coerced = coerceValue(rawValue, existing);

      if (key === 'clawguard.mode' && coerced !== 'enforce' && coerced !== 'monitor') {
        console.error(`  ${c.red('✗')}  clawguard.mode must be "enforce" or "monitor", got "${rawValue}"`);
        process.exitCode = 1;
        return;
      }

      try {
        config.setNested(key, coerced);
      } catch (err) {
        console.error(`  ${c.red('✗')}  Invalid value for ${key}: ${String(err)}`);
        process.exitCode = 1;
        return;
      }

      console.log(`  ${c.green('✓')}  ${c.bold(key)} = ${formatValue(coerced)}`);

      if (!isKnown) {
        console.log(`  ${c.yellow('⚠')}  Unknown key — verify spelling against: ${c.cyan('clawsentinel config list')}`);
      }

      if (key === 'clawguard.mode') {
        if (coerced === 'monitor') {
          console.log(`  ${c.yellow('⚠')}  Monitor mode: ClawGuard will ${c.bold('alert but NOT block')} traffic.`);
        } else {
          console.log(`  ${c.green('✓')}  Enforce mode: ClawGuard will block detected attacks.`);
        }
        console.log(`  ${c.dim('Restart to apply:')} ${c.cyan('clawsentinel stop -m clawguard && clawsentinel start -m clawguard')}`);
      }
    });

  // ── reset ──────────────────────────────────────────────────────────────────
  cmd.command('reset')
    .description('Reset all configuration to defaults')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (options: { yes?: boolean }) => {
      if (!options.yes) {
        const ok = await askYesNo(`  ${c.yellow('Reset all config to defaults?')} ${c.dim('[y/N]')} `);
        console.log('');
        if (!ok) {
          console.log(`  ${c.dim('Reset cancelled.')}`);
          return;
        }
      }

      try {
        fs.unlinkSync(CONFIG_PATH);
      } catch { /* already gone */ }

      config.reload(); // re-creates with defaults
      console.log(`  ${c.green('✓')}  Configuration reset to defaults.`);
    });

  return cmd;
}
