import { Command } from 'commander';
import { autoDetectAndStoreKeys } from '@clawsentinel/clawvault';
import { config, moduleLogger } from '@clawsentinel/core';

const log = moduleLogger('cli:init');

export function initCommand(): Command {
  return new Command('init')
    .description('Set up ClawSentinel and auto-detect your OpenClaw installation')
    .option('--skip-key-detection', 'Skip automatic API key detection from OpenClaw config')
    .option('--no-docker', 'Skip ClawBox Docker setup')
    .action(async (options: { skipKeyDetection?: boolean; docker?: boolean }) => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════════╗');
      console.log('  ║      ClawSentinel — Initializing v0.1.0      ║');
      console.log('  ║  One Install. Five Layers. Complete Protection║');
      console.log('  ╚══════════════════════════════════════════════╝');
      console.log('');

      // Step 1: Initialize configuration
      console.log('  [1/4] Loading configuration...');
      config.load();
      console.log('        ✓ Configuration ready');

      // Step 2: Auto-detect API keys
      if (!options.skipKeyDetection) {
        console.log('  [2/4] Detecting API keys from OpenClaw installation...');
        const result = await autoDetectAndStoreKeys();

        if (result.provider === 'none') {
          console.log('        ℹ  No LLM API key found');
          console.log('           Pattern engine active (catches 80%+ of injections)');
          console.log('           To add a key later: clawsentinel vault set anthropic <your-key>');
        } else {
          const providerName = {
            anthropic: 'Anthropic Claude Haiku',
            openai: 'OpenAI GPT-4o-mini',
            gemini: 'Google Gemini Flash',
            ollama: 'Ollama (local)'
          }[result.provider];
          console.log(`        ✓ Semantic engine ready → using ${providerName}`);
          if (result.provider !== 'ollama') {
            console.log('          Estimated usage: ~100 scans/day, minimal quota impact');
          }
        }
      } else {
        console.log('  [2/4] Key detection skipped (--skip-key-detection)');
      }

      // Step 3: Validate OpenClaw installation
      console.log('  [3/4] Checking OpenClaw installation...');
      const ocStatus = await checkOpenClawInstallation();
      if (ocStatus.found) {
        console.log(`        ✓ OpenClaw found at ${ocStatus.path}`);
        console.log(`          Port: :${ocStatus.port}`);
      } else {
        console.log('        ⚠  OpenClaw not found in PATH');
        console.log('           ClawSentinel will wait for OpenClaw to start on :18789');
      }

      // Step 4: Write init marker
      console.log('  [4/4] Finalizing setup...');
      config.set('version', '0.1.0');
      console.log('        ✓ ClawSentinel initialized');

      console.log('');
      console.log('  ╔══════════════════════════════════════════════╗');
      console.log('  ║               Setup Complete                 ║');
      console.log('  ╠══════════════════════════════════════════════╣');
      console.log('  ║                                              ║');
      console.log('  ║  Run:  clawsentinel start                    ║');
      console.log('  ║        → Proxy:     ws://127.0.0.1:18790     ║');
      console.log('  ║        → Dashboard: http://localhost:7432     ║');
      console.log('  ║                                              ║');
      console.log('  ║  Point your OpenClaw client to :18790        ║');
      console.log('  ║  (instead of the default :18789)             ║');
      console.log('  ║                                              ║');
      console.log('  ╚══════════════════════════════════════════════╝');
      console.log('');
    });
}

async function checkOpenClawInstallation(): Promise<{
  found: boolean;
  path?: string;
  port?: number;
}> {
  try {
    const { execSync } = await import('child_process');
    const ocPath = execSync('which openclaw 2>/dev/null', { encoding: 'utf8' }).trim();
    if (ocPath) {
      return { found: true, path: ocPath, port: 18789 };
    }
  } catch {
    // Not found
  }
  return { found: false };
}
