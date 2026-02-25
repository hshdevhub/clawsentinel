import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const CLAWSENTINEL_DIR = path.join(os.homedir(), '.clawsentinel');
const RUN_DIR = path.join(CLAWSENTINEL_DIR, 'run');
const DB_FILE = path.join(CLAWSENTINEL_DIR, 'clawsentinel.db');

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function confirm(question: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

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

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function stopRunningModules(): string[] {
  const stopped: string[] = [];
  for (const name of ['clawguard', 'claweye']) {
    const pid = readPid(name);
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        stopped.push(`${name} (PID ${pid})`);
      } catch { /* already gone */ }
    }
  }
  return stopped;
}

export function uninstallCommand(): Command {
  return new Command('uninstall')
    .description('Remove all ClawSentinel data and stop all running modules')
    .option('--yes', 'Skip confirmation prompt')
    .option('--keep-db', 'Preserve the event database (logs and scan results)')
    .action(async (options: { yes?: boolean; keepDb?: boolean }) => {
      console.log('');
      console.log(`  ${c.bold('ClawSentinel Uninstall')}`);
      console.log('');
      console.log(`  This will remove:`);
      console.log(`  ${c.dim('•')} All running ClawSentinel processes (SIGTERM)`);
      if (!options.keepDb) {
        console.log(`  ${c.dim('•')} Event database  ${c.dim(DB_FILE)}`);
      }
      console.log(`  ${c.dim('•')} PID files and run directory  ${c.dim(RUN_DIR)}`);
      console.log(`  ${c.dim('•')} Config directory  ${c.dim(CLAWSENTINEL_DIR)}`);
      console.log('');

      if (!options.yes) {
        const ok = await confirm(`  ${c.yellow('Are you sure?')} ${c.dim('This cannot be undone. [y/N]')} `);
        if (!ok) {
          console.log(`\n  ${c.dim('Uninstall cancelled.')}\n`);
          return;
        }
        console.log('');
      }

      // 1. Stop running modules
      const stopped = stopRunningModules();
      if (stopped.length > 0) {
        for (const m of stopped) {
          console.log(`  ${c.green('✓')}  Stopped: ${m}`);
        }
        // Give processes a moment to exit cleanly
        await new Promise(r => setTimeout(r, 800));
      } else {
        console.log(`  ${c.dim('○')}  No running modules found`);
      }

      // 2. Remove database (unless --keep-db)
      if (!options.keepDb && fs.existsSync(DB_FILE)) {
        try {
          fs.unlinkSync(DB_FILE);
          console.log(`  ${c.green('✓')}  Removed database: ${c.dim(DB_FILE)}`);
        } catch (err) {
          console.log(`  ${c.yellow('⚠')}  Could not remove database: ${String(err)}`);
        }
        // Also remove WAL/SHM files if present
        for (const ext of ['-wal', '-shm']) {
          try { fs.unlinkSync(DB_FILE + ext); } catch { /* not present */ }
        }
      } else if (options.keepDb) {
        console.log(`  ${c.dim('○')}  Database preserved (--keep-db): ${c.dim(DB_FILE)}`);
      }

      // 3. Remove the ~/.clawsentinel directory
      if (fs.existsSync(CLAWSENTINEL_DIR)) {
        try {
          fs.rmSync(CLAWSENTINEL_DIR, { recursive: true, force: true });
          console.log(`  ${c.green('✓')}  Removed config directory: ${c.dim(CLAWSENTINEL_DIR)}`);
        } catch (err) {
          console.log(`  ${c.yellow('⚠')}  Could not fully remove config dir: ${String(err)}`);
        }
      }

      console.log('');
      console.log(`  ${c.green('ClawSentinel has been uninstalled.')}`);
      console.log(`  ${c.dim('The npm package is still installed — to fully remove:')}`)
      console.log(`  ${c.cyan('  npm uninstall -g clawsentinel')}`);
      console.log('');
    });
}
