import { Command } from 'commander';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const THREAT_MODELS = [
  { id: 'T1', label: 'Prompt Injection',     file: 't1-prompt-injection.ts' },
  { id: 'T2', label: 'Supply Chain',          file: 't2-supply-chain.ts' },
  { id: 'T3', label: 'Open DM / Indirect',    file: 't3-open-dm.ts' },
  { id: 'T5', label: 'Tool Abuse',            file: 't5-tool-abuse.ts' },
  { id: 'T6', label: 'Memory Tampering',      file: 't6-memory-tampering.ts' },
  { id: 'T7', label: 'Credential Theft',      file: 't7-credential-theft.ts' },
] as const;

function findRepoRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd()),
    path.resolve(__dirname, '..', '..', '..', '..'),
  ];
  return candidates.find(p => fs.existsSync(path.join(p, 'tests', 'attack-suite'))) ?? null;
}

function runVitest(testFile: string, repoRoot: string, json: boolean): Promise<{
  pass: boolean;
  output: string;
  passCount: number;
  failCount: number;
}> {
  return new Promise(resolve => {
    const vitestBin = path.join(repoRoot, 'node_modules', '.bin', 'vitest');
    const testPath = path.join(repoRoot, 'tests', 'attack-suite', testFile);

    if (!fs.existsSync(testPath)) {
      resolve({ pass: false, output: `Test file not found: ${testFile}`, passCount: 0, failCount: 0 });
      return;
    }

    const args = ['run', testPath, '--reporter=verbose'];
    const proc = spawn(
      fs.existsSync(vitestBin) ? vitestBin : 'npx vitest',
      fs.existsSync(vitestBin) ? args : args,
      { cwd: repoRoot, stdio: 'pipe', shell: !fs.existsSync(vitestBin) }
    );

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });

    proc.on('close', code => {
      // Parse pass/fail counts from vitest output
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);
      const passCount = passMatch ? parseInt(passMatch[1]!, 10) : 0;
      const failCount = failMatch ? parseInt(failMatch[1]!, 10) : 0;
      resolve({ pass: code === 0, output, passCount, failCount });
    });

    proc.on('error', (err) => {
      resolve({ pass: false, output: `Failed to spawn vitest: ${err.message}`, passCount: 0, failCount: 0 });
    });
  });
}

export function testCommand(): Command {
  return new Command('test')
    .description('Run ClawSentinel security test suites')
    .option('--attack-suite', 'Run all 6 threat model attack scenarios (T1-T7)')
    .option('--threat <id>', 'Run a specific threat model (T1, T2, T3, T5, T6, T7)')
    .option('--json', 'Output results as JSON')
    .option('--fail-fast', 'Stop after first failing threat model')
    .action(async (options: { attackSuite?: boolean; threat?: string; json?: boolean; failFast?: boolean }) => {
      const repoRoot = findRepoRoot();

      if (!repoRoot) {
        console.error('[ClawSentinel] Could not locate tests/attack-suite/ directory.');
        console.error('  Run this command from the clawsentinel-dev repository root.');
        process.exit(1);
      }

      // Determine which threat models to run
      let modelsToRun = [...THREAT_MODELS];
      if (options.threat) {
        const id = options.threat.toUpperCase();
        modelsToRun = THREAT_MODELS.filter(m => m.id === id);
        if (modelsToRun.length === 0) {
          console.error(`[ClawSentinel] Unknown threat model: ${options.threat}`);
          console.error(`  Available: ${THREAT_MODELS.map(m => m.id).join(', ')}`);
          process.exit(1);
        }
      } else if (!options.attackSuite) {
        // Default: print help
        console.log('[ClawSentinel] Attack Suite\n');
        console.log('  Usage:');
        console.log('    clawsentinel test --attack-suite         Run all threat models');
        console.log('    clawsentinel test --threat T1             Run specific threat model');
        console.log('    clawsentinel test --attack-suite --json   JSON output for CI\n');
        console.log('  Threat Models:');
        for (const m of THREAT_MODELS) {
          const exists = fs.existsSync(path.join(repoRoot, 'tests', 'attack-suite', m.file));
          console.log(`    ${m.id}  ${m.label.padEnd(22)} ${exists ? '✓' : '✗ (not found)'}`);
        }
        return;
      }

      if (!options.json) {
        console.log('\n[ClawSentinel] Attack Suite\n');
        console.log(`  Running ${modelsToRun.length} threat model(s)...\n`);
      }

      const results: Array<{
        id: string;
        label: string;
        pass: boolean;
        passCount: number;
        failCount: number;
        durationMs: number;
      }> = [];

      let overallPass = true;

      for (const model of modelsToRun) {
        if (!options.json) {
          process.stdout.write(`  ${model.id}  ${model.label.padEnd(22)} running… `);
        }

        const start = Date.now();
        const result = await runVitest(model.file, repoRoot, options.json ?? false);
        const durationMs = Date.now() - start;

        results.push({
          id: model.id,
          label: model.label,
          pass: result.pass,
          passCount: result.passCount,
          failCount: result.failCount,
          durationMs
        });

        if (!result.pass) overallPass = false;

        if (!options.json) {
          const status = result.pass ? '✓ PASS' : '✗ FAIL';
          const color = result.pass ? '\x1b[32m' : '\x1b[31m';
          const reset = '\x1b[0m';
          const counts = `${result.passCount} passed, ${result.failCount} failed`;
          const dur = `${(durationMs / 1000).toFixed(1)}s`;
          console.log(`${color}${status}${reset}  (${counts})  ${dur}`);

          if (!result.pass) {
            // Show failing test output
            const failLines = result.output
              .split('\n')
              .filter(l => l.includes('FAIL') || l.includes('AssertionError') || l.includes('Error:') || l.includes('✗'))
              .slice(0, 8)
              .map(l => `       ${l.trim()}`)
              .join('\n');
            if (failLines) console.log(failLines);
          }
        }

        if (!result.pass && options.failFast) {
          if (!options.json) {
            console.log('\n  ⚡ Stopped early (--fail-fast)\n');
          }
          break;
        }
      }

      if (options.json) {
        const summary = {
          pass: overallPass,
          threatModels: results,
          total: results.length,
          passed: results.filter(r => r.pass).length,
          failed: results.filter(r => !r.pass).length,
          totalTests: results.reduce((s, r) => s + r.passCount + r.failCount, 0),
          totalPassed: results.reduce((s, r) => s + r.passCount, 0),
          totalFailed: results.reduce((s, r) => s + r.failCount, 0),
        };
        console.log(JSON.stringify(summary, null, 2));
      } else {
        // Summary table
        const passedModels = results.filter(r => r.pass).length;
        const totalTests = results.reduce((s, r) => s + r.passCount + r.failCount, 0);
        const passedTests = results.reduce((s, r) => s + r.passCount, 0);

        console.log(`\n  ─────────────────────────────────────────`);
        console.log(`  Threat models: ${passedModels}/${results.length} passed`);
        console.log(`  Test cases:    ${passedTests}/${totalTests} passed`);
        console.log(`  Coverage:      T1 T2 T3 T5 T6 T7 (4 missing T4)`);
        console.log(`  ─────────────────────────────────────────\n`);

        if (overallPass) {
          console.log('  \x1b[32m✓ All threat models passed\x1b[0m\n');
        } else {
          const failed = results.filter(r => !r.pass).map(r => r.id).join(', ');
          console.log(`  \x1b[31m✗ Failed threat models: ${failed}\x1b[0m\n`);
        }
      }

      process.exit(overallPass ? 0 : 1);
    });
}
