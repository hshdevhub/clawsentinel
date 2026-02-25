import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getDb } from '@clawsentinel/core';

const RUN_DIR = path.join(os.homedir(), '.clawsentinel', 'run');

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// Known module PID files
const ALL_MODULES = ['clawguard', 'claweye'];

function readPid(name: string): number | null {
  const pidFile = path.join(RUN_DIR, `${name}.pid`);
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function removePidFile(name: string) {
  try { fs.unlinkSync(path.join(RUN_DIR, `${name}.pid`)); } catch { /* already gone */ }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = check existence only
    return true;
  } catch {
    return false;
  }
}

function stopProcess(name: string, pid: number, force: boolean): boolean {
  try {
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    process.kill(pid, signal);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false; // process not found — already stopped
    throw err;
  }
}

function markStopped(name: string) {
  try {
    const db = getDb();
    db.prepare(`UPDATE module_status SET status = 'stopped', updated_at = datetime('now') WHERE name = ?`)
      .run(name);
  } catch { /* DB may not be available — non-fatal */ }
}

export function stopCommand(): Command {
  return new Command('stop')
    .description('Stop all ClawSentinel modules')
    .option('-m, --module <name>', 'Stop a specific module only (clawguard|claweye)')
    .option('--force', 'Send SIGKILL instead of SIGTERM (immediate kill)')
    .action((options: { module?: string; force?: boolean }) => {
      const targets = options.module
        ? [options.module.toLowerCase()]
        : ALL_MODULES;

      console.log('');
      let anyRunning = false;

      for (const name of targets) {
        if (!ALL_MODULES.includes(name)) {
          console.error(`  Unknown module: ${name}. Available: ${ALL_MODULES.join(', ')}`);
          continue;
        }

        const pid = readPid(name);

        if (pid === null) {
          console.log(`  ${c.dim('○')}  ${name.padEnd(16)} ${c.dim('not running (no PID file)')}`);
          continue;
        }

        if (!isProcessRunning(pid)) {
          console.log(`  ${c.dim('○')}  ${name.padEnd(16)} ${c.dim(`already stopped (PID ${pid} not found)`)}`);
          removePidFile(name);
          markStopped(name);
          continue;
        }

        anyRunning = true;
        const stopped = stopProcess(name, pid, options.force ?? false);

        if (stopped) {
          // Wait briefly then verify
          const signal = options.force ? 'SIGKILL' : 'SIGTERM';
          console.log(`  ${c.green('✓')}  ${name.padEnd(16)} ${c.dim(`sent ${signal} to PID ${pid}`)}`);
          markStopped(name);
          removePidFile(name);
        } else {
          console.log(`  ${c.yellow('⚠')}  ${name.padEnd(16)} ${c.dim(`PID ${pid} — process not found`)}`);
          removePidFile(name);
        }
      }

      if (!anyRunning && targets.length === ALL_MODULES.length) {
        console.log(`  ${c.dim('Nothing to stop — ClawSentinel is not running.')}`);
        console.log(`  ${c.dim('Run')} ${c.cyan('clawsentinel start')} ${c.dim('to start all modules.')}`);
      } else if (anyRunning) {
        console.log('');
        console.log(`  ${c.dim('All modules stopped.')} ${c.dim('OpenClaw is now unprotected.')}`);
        console.log(`  ${c.dim('Run')} ${c.cyan('clawsentinel start')} ${c.dim('to restart protection.')}`);
      }

      console.log('');
    });
}
