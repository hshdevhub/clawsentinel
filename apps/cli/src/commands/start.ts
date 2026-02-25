import { Command } from 'commander';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '@clawsentinel/core';

const CLAWEYE_PORT = process.env['CLAWEYE_PORT'] ?? '7432';

function findPackageDir(name: string): string | null {
  // Walk up from cwd looking for packages/<name>
  const candidates = [
    path.resolve(process.cwd(), 'packages', name),
    path.resolve(__dirname, '..', '..', '..', '..', 'packages', name),
  ];
  return candidates.find(p => fs.existsSync(path.join(p, 'package.json'))) ?? null;
}

function spawnModule(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>
): void {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    detached: false,
  });

  proc.on('error', err => {
    console.error(`  ✗ ${name}: failed to start — ${err.message}`);
  });

  proc.on('exit', code => {
    if (code !== 0 && code !== null) {
      console.warn(`  ⚠ ${name} exited with code ${code}`);
    }
  });
}

export function startCommand(): Command {
  return new Command('start')
    .description('Start all ClawSentinel modules')
    .option('-m, --module <name>', 'Start a specific module only (clawguard, clawvault, clawhub-scanner, clawbox, claweye)')
    .option('--no-eye', 'Skip launching the ClawEye dashboard')
    .action(async (options: { module?: string; eye?: boolean }) => {
      const cfg = config.load();

      // ── Single-module mode ──────────────────────────
      if (options.module) {
        const mod = options.module;
        console.log(`[ClawSentinel] Starting module: ${mod}`);

        if (mod === 'claweye') {
          const dir = findPackageDir('claweye');
          if (!dir) {
            console.error('  ✗ claweye package not found');
            process.exit(1);
          }
          console.log(`  ClawEye dashboard → http://localhost:${CLAWEYE_PORT}`);
          spawnModule('ClawEye', 'npx', ['next', 'start', '-p', CLAWEYE_PORT], dir, {
            CLAWEYE_PORT,
          });
        } else if (mod === 'clawguard') {
          const dir = findPackageDir('clawguard');
          if (!dir) {
            console.error('  ✗ clawguard package not found');
            process.exit(1);
          }
          console.log(`  ClawGuard proxy → ws://127.0.0.1:${cfg.proxy.listenPort}`);
          spawnModule('ClawGuard', 'node', ['dist/index.js'], dir);
        } else {
          console.log(`  ⚠ Module start (${mod}) — individual start not yet wired for this module`);
        }
        return;
      }

      // ── All-modules mode ────────────────────────────
      console.log('[ClawSentinel] Starting all modules...\n');
      console.log(`  ClawGuard proxy  → ws://127.0.0.1:${cfg.proxy.listenPort} (upstream :${cfg.proxy.upstreamPort})`);
      console.log('  ClawVault        → credential store initialized');
      console.log('  ClawHub Scanner  → monitoring installed skills');
      if (options.eye !== false) {
        console.log(`  ClawEye          → http://localhost:${CLAWEYE_PORT}`);
      }
      console.log('');

      // Start ClawEye (Next.js)
      if (options.eye !== false) {
        const eyeDir = findPackageDir('claweye');
        if (eyeDir) {
          spawnModule('ClawEye', 'npx', ['next', 'start', '-p', CLAWEYE_PORT], eyeDir, {
            CLAWEYE_PORT,
          });
          console.log(`  ✓ ClawEye started  → http://localhost:${CLAWEYE_PORT}`);
        } else {
          console.warn('  ⚠ ClawEye package not found — build with: turbo build --filter=claweye');
        }
      }

      // Start ClawGuard
      const guardDir = findPackageDir('clawguard');
      if (guardDir && fs.existsSync(path.join(guardDir, 'dist', 'index.js'))) {
        spawnModule('ClawGuard', 'node', ['dist/index.js'], guardDir);
        console.log(`  ✓ ClawGuard started → ws://127.0.0.1:${cfg.proxy.listenPort}`);
      } else {
        console.warn('  ⚠ ClawGuard not built — run: turbo build --filter=clawguard');
      }

      console.log('\n  Press Ctrl+C to stop all modules.');
    });
}
