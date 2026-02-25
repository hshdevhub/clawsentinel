import { Command } from 'commander';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { config } from '@clawsentinel/core';

const CLAWEYE_PORT = process.env['CLAWEYE_PORT'] ?? '7432';
const RUN_DIR = path.join(os.homedir(), '.clawsentinel', 'run');

// Inline ANSI helpers
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function findPackageDir(name: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'packages', name),
    path.resolve(__dirname, '..', '..', '..', '..', 'packages', name),
  ];
  return candidates.find(p => fs.existsSync(path.join(p, 'package.json'))) ?? null;
}

function writePid(name: string, pid: number) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, `${name}.pid`), String(pid), 'utf8');
}

function spawnModule(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>
): ChildProcess {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    detached: false,
  });

  if (proc.pid) writePid(name, proc.pid);

  proc.on('error', err => {
    console.error(`  ${c.yellow('⚠')}  ${name}: failed to start — ${err.message}`);
  });

  proc.on('exit', (code, signal) => {
    if (code !== 0 && code !== null && signal !== 'SIGTERM') {
      console.warn(`  ${c.yellow('⚠')}  ${name} exited (code ${code})`);
    }
    // Clean up PID file on exit
    try { fs.unlinkSync(path.join(RUN_DIR, `${name}.pid`)); } catch { /* gone */ }
  });

  return proc;
}

export function startCommand(): Command {
  return new Command('start')
    .description('Start all ClawSentinel modules')
    .option('-m, --module <name>', 'Start a specific module only (clawguard|claweye)')
    .option('--no-eye', 'Skip launching the ClawEye dashboard')
    .action(async (options: { module?: string; eye?: boolean }) => {
      const cfg = config.load();

      // ── Single-module mode ─────────────────────────────────────────────────
      if (options.module) {
        const mod = options.module.toLowerCase();

        if (mod === 'claweye') {
          const dir = findPackageDir('claweye');
          if (!dir) { console.error('  ✗ claweye package not found'); process.exit(1); }
          console.log(`  Starting ClawEye → http://localhost:${CLAWEYE_PORT}`);
          spawnModule('claweye', 'npx', ['next', 'start', '-p', CLAWEYE_PORT], dir, { CLAWEYE_PORT });

        } else if (mod === 'clawguard') {
          const dir = findPackageDir('clawguard');
          if (!dir) { console.error('  ✗ clawguard package not found'); process.exit(1); }
          const distEntry = path.join(dir, 'dist', 'index.js');
          if (!fs.existsSync(distEntry)) {
            console.error('  ✗ ClawGuard not built — run: turbo build --filter=clawguard');
            process.exit(1);
          }
          console.log(`  Starting ClawGuard → ws://127.0.0.1:${cfg.proxy.listenPort}`);
          spawnModule('clawguard', 'node', [distEntry], dir);

        } else {
          console.error(`  Unknown module: ${mod}. Available: clawguard, claweye`);
          process.exit(1);
        }
        return;
      }

      // ── All-modules mode ───────────────────────────────────────────────────
      console.log('');
      console.log(`  ${c.bold('ClawSentinel')} — Starting all modules\n`);

      let started = 0;

      // 1. ClawGuard (WS proxy + HTTP proxy + ClawHub Scanner watcher in same process)
      const guardDir = findPackageDir('clawguard');
      const guardDist = guardDir ? path.join(guardDir, 'dist', 'index.js') : null;

      if (guardDir && guardDist && fs.existsSync(guardDist)) {
        spawnModule('clawguard', 'node', [guardDist], guardDir);
        console.log(`  ${c.green('●')}  ClawGuard        ${c.dim('→')} ${c.cyan(`ws://127.0.0.1:${cfg.proxy.listenPort}`)}`);
        console.log(`     ${c.dim('Injection firewall + WS proxy + ClawHub Scanner watcher')}`);
        started++;
      } else {
        console.log(`  ${c.yellow('○')}  ClawGuard        ${c.dim('not built — run:')} ${c.cyan('turbo build --filter=clawguard')}`);
      }

      // 2. ClawVault (library — initialised inside ClawGuard process, no separate process needed)
      console.log(`  ${c.green('●')}  ClawVault        ${c.dim('→ credential store ready (in-process)')}`);
      console.log(`     ${c.dim('AES-256-GCM encryption + OS keychain')}`);

      // 3. ClawHub Scanner (runs inside ClawGuard process via startClawHubScanner())
      console.log(`  ${c.green('●')}  ClawHub Scanner  ${c.dim('→ skill watcher active (in ClawGuard process)')}`);
      console.log(`     ${c.dim(`Monitoring ${process.env['OPENCLAW_SKILLS_DIR'] ?? '~/.openclaw/skills'}`)}`);

      // 4. ClawEye dashboard (Next.js — separate process)
      if (options.eye !== false) {
        const eyeDir = findPackageDir('claweye');
        if (eyeDir) {
          spawnModule('claweye', 'npx', ['next', 'start', '-p', CLAWEYE_PORT], eyeDir, { CLAWEYE_PORT });
          console.log(`  ${c.green('●')}  ClawEye          ${c.dim('→')} ${c.cyan(`http://localhost:${CLAWEYE_PORT}`)}`);
          console.log(`     ${c.dim('Real-time dashboard + correlation engine')}`);
          started++;
        } else {
          console.log(`  ${c.yellow('○')}  ClawEye          ${c.dim('not built — run:')} ${c.cyan('turbo build --filter=claweye')}`);
        }
      } else {
        console.log(`  ${c.dim('○')}  ClawEye          ${c.dim('skipped (--no-eye)')}`);
      }

      if (started === 0) {
        console.log(`\n  ${c.yellow('⚠')}  No modules could start. Build first:\n`);
        console.log(`     ${c.cyan('npm run build')}\n`);
        process.exit(1);
      }

      console.log('');
      console.log(`  ${c.dim('OpenClaw clients should connect to:')} ${c.cyan(`ws://127.0.0.1:${cfg.proxy.listenPort}`)}`);
      console.log(`  ${c.dim('(instead of the default :18789)')}`);
      console.log('');
      console.log(`  ${c.dim('Press Ctrl+C or run')} ${c.cyan('clawsentinel stop')} ${c.dim('to shut down.')}`);
      console.log('');

      // Keep CLI alive so spawned child processes stay running
      process.on('SIGINT', () => {
        console.log('\n  Shutting down...');
        process.exit(0);
      });
    });
}
