import { Command } from 'commander';
import { autoDetectAndStoreKeys } from '@clawsentinel/clawvault';
import { config, getDb, moduleLogger } from '@clawsentinel/core';

const log = moduleLogger('cli:init');

const VERSION = '0.6.0';

// ANSI colour helpers (inline to avoid ESM-only chalk import complexity in CJS bundle)
const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  grey:   (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function printBanner() {
  console.log('');
  console.log(c.cyan('  ╔══════════════════════════════════════════════════╗'));
  console.log(c.cyan('  ║') + c.bold('  ClawSentinel') + c.dim(` v${VERSION}`) + ' '.repeat(27 - VERSION.length) + c.cyan('║'));
  console.log(c.cyan('  ║') + '  One Install. Five Layers. Complete Protection.  ' + c.cyan('║'));
  console.log(c.cyan('  ╚══════════════════════════════════════════════════╝'));
  console.log('');
}

function step(n: number, total: number, label: string) {
  process.stdout.write(`  ${c.dim(`[${n}/${total}]`)} ${label}...`);
}

function ok(detail = '') {
  process.stdout.write(` ${c.green('✓')}${detail ? c.dim(' ' + detail) : ''}\n`);
}

function warn(detail = '') {
  process.stdout.write(` ${c.yellow('⚠')}${detail ? ' ' + detail : ''}\n`);
}

function info(line: string) {
  console.log(`          ${c.grey(line)}`);
}

export function initCommand(): Command {
  return new Command('init')
    .description('Set up ClawSentinel and auto-detect your OpenClaw installation')
    .option('--skip-key-detection', 'Skip automatic API key detection from OpenClaw config')
    .option('--no-docker', 'Skip ClawBox Docker setup')
    .action(async (options: { skipKeyDetection?: boolean; docker?: boolean }) => {
      printBanner();

      // Step 1: Load configuration
      step(1, 4, 'Loading configuration');
      config.load();
      ok();

      // Step 2: API key detection
      if (!options.skipKeyDetection) {
        step(2, 4, 'Detecting API keys from OpenClaw');
        const result = await autoDetectAndStoreKeys();

        if (result.provider === 'none') {
          warn('No LLM key found');
          info('Pattern engine active — catches 80%+ of injections without a key');
          info(`Add one later: ${c.cyan('clawsentinel vault set anthropic <your-key>')}`);
        } else {
          const providerLabels: Record<string, string> = {
            anthropic: 'Anthropic Claude Haiku',
            openai:    'OpenAI GPT-4o-mini',
            gemini:    'Google Gemini Flash',
            ollama:    'Ollama (local)',
          };
          const label = providerLabels[result.provider] ?? result.provider;
          ok(`semantic engine → ${c.cyan(label)}`);
          if (result.provider !== 'ollama') {
            info('~100 scans/day — minimal quota impact (cost-gated at pattern score > 30)');
          }
        }
      } else {
        step(2, 4, 'Key detection');
        ok(c.dim('skipped (--skip-key-detection)'));
      }

      // Step 3: OpenClaw detection
      step(3, 4, 'Checking OpenClaw installation');
      const ocStatus = await checkOpenClawInstallation();
      if (ocStatus.found) {
        ok(`found at ${c.cyan(ocStatus.path ?? 'unknown')}`);
        info(`Listening on :${ocStatus.port ?? 18789} → ClawSentinel will proxy on :18790`);
      } else {
        warn('OpenClaw not in PATH');
        info('ClawSentinel will wait for OpenClaw to start on :18789');
        info(`Install OpenClaw: ${c.cyan('https://github.com/openclaw/openclaw')}`);
      }

      // Step 4: Database initialisation
      step(4, 4, 'Initialising database');
      try {
        getDb(); // triggers schema migration
        ok(`~/.clawsentinel/clawsentinel.db`);
      } catch (err) {
        warn('DB init failed — will retry on first start');
        log.warn('DB init error', { err });
      }

      config.set('version', VERSION);
      config.set('initialised', true);

      // Done
      console.log('');
      console.log(c.cyan('  ╔══════════════════════════════════════════════════╗'));
      console.log(c.cyan('  ║') + c.green(c.bold('  Setup complete'))  + ' '.repeat(34) + c.cyan('║'));
      console.log(c.cyan('  ╠══════════════════════════════════════════════════╣'));
      console.log(c.cyan('  ║') + '                                                  ' + c.cyan('║'));
      console.log(c.cyan('  ║') + `  Run: ${c.cyan('clawsentinel start')}` + ' '.repeat(27) + c.cyan('║'));
      console.log(c.cyan('  ║') + `       ${c.dim('→ Proxy:     ')}${c.cyan('ws://127.0.0.1:18790')}` + ' '.repeat(10) + c.cyan('║'));
      console.log(c.cyan('  ║') + `       ${c.dim('→ Dashboard: ')}${c.cyan('http://localhost:7432')}` + ' '.repeat(9) + c.cyan('║'));
      console.log(c.cyan('  ║') + '                                                  ' + c.cyan('║'));
      console.log(c.cyan('  ║') + `  ${c.dim('Point your OpenClaw client to :18790')}` + ' '.repeat(14) + c.cyan('║'));
      console.log(c.cyan('  ║') + `  ${c.dim('(instead of the default :18789)')}` + ' '.repeat(18) + c.cyan('║'));
      console.log(c.cyan('  ║') + '                                                  ' + c.cyan('║'));
      console.log(c.cyan('  ╚══════════════════════════════════════════════════╝'));
      console.log('');
    });
}

async function checkOpenClawInstallation(): Promise<{ found: boolean; path?: string; port?: number }> {
  try {
    const { execSync } = await import('child_process');
    const ocPath = execSync('which openclaw 2>/dev/null', { encoding: 'utf8' }).trim();
    if (ocPath) return { found: true, path: ocPath, port: 18789 };
  } catch {
    // not found
  }
  return { found: false };
}
