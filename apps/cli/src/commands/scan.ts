import { Command } from 'commander';
import fs from 'fs';
import { skillScanner, installInterceptor } from '@clawsentinel/clawhub-scanner';

export function scanCommand(): Command {
  return new Command('scan')
    .description('Scan a skill for supply chain threats before install')
    .argument('<skill-id>', 'Skill ID or path to local skill file/directory')
    .option('--file <path>', 'Scan a local file directly')
    .option('--force', 'Install even if scan result is warn (does not bypass block)')
    .option('--json', 'Output raw JSON result')
    .action(async (skillId: string, options: { file?: string; force?: boolean; json?: boolean }) => {
      const reset  = '\x1b[0m';
      const bold   = '\x1b[1m';
      const red    = '\x1b[31m';
      const yellow = '\x1b[33m';
      const green  = '\x1b[32m';
      const grey   = '\x1b[90m';

      // ── Local file scan ─────────────────────────────────────────────────────
      if (options.file || fs.existsSync(skillId)) {
        const filePath = options.file ?? skillId;
        let source: string;
        try {
          source = fs.readFileSync(filePath, 'utf8');
        } catch {
          console.error(`${red}Error: Cannot read file: ${filePath}${reset}`);
          process.exit(1);
        }

        const result = skillScanner.scan(skillId, source, { source: 'manual' });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          process.exit(result.verdict === 'block' ? 2 : result.verdict === 'warn' ? 1 : 0);
        }

        printScanResult(result, { bold, red, yellow, green, grey, reset });
        process.exit(result.verdict === 'block' ? 2 : 0);
      }

      // ── Pre-install intercept (fetch from ClawHub + scan) ───────────────────
      console.log(`${grey}Fetching and scanning skill "${skillId}" from ClawHub…${reset}\n`);

      const intercept = await installInterceptor.intercept(skillId).catch(err => {
        console.error(`${red}Scan failed: ${String(err)}${reset}`);
        process.exit(1);
      });

      if (options.json) {
        console.log(JSON.stringify(intercept, null, 2));
        process.exit(intercept.scanResult.verdict === 'block' ? 2 : intercept.scanResult.verdict === 'warn' ? 1 : 0);
      }

      printScanResult(intercept.scanResult, { bold, red, yellow, green, grey, reset });

      if (!intercept.allowed) {
        console.log(`\n${intercept.reason}`);

        if (intercept.scanResult.verdict === 'warn' && options.force) {
          console.log(`\n${yellow}--force flag set. Proceeding despite warnings.${reset}`);
          process.exit(0);
        }

        process.exit(intercept.scanResult.verdict === 'block' ? 2 : 1);
      }
    });
}

function printScanResult(
  result: import('@clawsentinel/clawhub-scanner').ScanResult,
  c: { bold: string; red: string; yellow: string; green: string; grey: string; reset: string }
): void {
  const { bold, red, yellow, green, grey, reset } = c;

  const verdictColor = result.verdict === 'block' ? red
                     : result.verdict === 'warn'  ? yellow
                     : green;
  const verdictIcon  = result.verdict === 'block' ? '🔴 BLOCKED'
                     : result.verdict === 'warn'  ? '⚠️  REVIEW'
                     : '✅ SAFE';

  console.log(`\n${bold}ClawHub Scanner — Skill Analysis${reset}`);
  console.log('─'.repeat(44));
  console.log(`  Skill   : ${bold}${result.skillId}${reset}`);
  console.log(`  Score   : ${verdictColor}${bold}${result.score}/100${reset}  (lower risk = higher score)`);
  console.log(`  Verdict : ${verdictColor}${bold}${verdictIcon}${reset}`);
  console.log(`  Lines   : ${result.linesScanned}`);
  console.log(`  Scanned : ${new Date(result.scannedAt).toLocaleString()}`);

  if (result.findings.length === 0) {
    console.log(`\n  ${green}No security findings. Skill appears safe to install.${reset}`);
    return;
  }

  console.log(`\n  ${bold}Findings (${result.findings.length}):${reset}`);

  const blocking = result.findings.filter(f => f.severity === 'block');
  const warnings = result.findings.filter(f => f.severity === 'warn');

  for (const f of blocking) {
    console.log(`\n  ${red}[${f.id}] ${f.description}${reset}`);
    if (f.lineNumber) console.log(`  ${grey}Line ${f.lineNumber}: ${f.snippet ?? ''}${reset}`);
  }

  for (const f of warnings) {
    console.log(`\n  ${yellow}[${f.id}] ${f.description}${reset}`);
    if (f.lineNumber) console.log(`  ${grey}Line ${f.lineNumber}: ${f.snippet ?? ''}${reset}`);
  }

  if (result.categories.length > 0) {
    console.log(`\n  ${grey}Categories: ${result.categories.join(', ')}${reset}`);
  }

  console.log('');
}
