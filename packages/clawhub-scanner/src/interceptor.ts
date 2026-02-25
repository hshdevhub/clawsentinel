// ClawHub Scanner — openclaw skill install Interceptor
// Wraps the `openclaw skill install <id>` CLI command.
// Fetches the skill source, runs static analysis, and:
//   - safe  → proceeds with install
//   - warn  → prompts user for confirmation
//   - block → refuses install, logs to audit trail

import fs from 'fs';
import path from 'path';
import os from 'os';
import { moduleLogger, eventBus } from '@clawsentinel/core';
import { skillScanner, type ScanResult } from './scanner.js';
import { hashVerifier } from './hash-verifier.js';

const log = moduleLogger('clawhub-scanner:interceptor');

// ClawHub API base — where skill source is fetched from
const CLAWHUB_API = process.env['CLAWHUB_API'] ?? 'https://clawhub.ai/api';

export interface InterceptResult {
  skillId: string;
  allowed: boolean;
  scanResult: ScanResult;
  reason: string;
}

export class InstallInterceptor {
  // Main entry point — call this before any skill install
  async intercept(skillId: string, sourceCode?: string): Promise<InterceptResult> {
    log.info(`Pre-install scan: "${skillId}"`);

    let source = sourceCode;

    // If source not provided, fetch from ClawHub API
    if (!source) {
      try {
        source = await this.fetchSkillSource(skillId);
      } catch (err) {
        log.warn(`Cannot fetch skill source for "${skillId}" — allowing with warning`, {
          error: String(err)
        });
        // Cannot scan what we cannot fetch — allow with warn event
        eventBus.emit('clawhub:scan-failed', {
          source: 'clawhub-scanner',
          severity: 'warn',
          category: 'supply_chain',
          description: `Could not fetch source for skill "${skillId}" — pre-install scan skipped`,
          payload: { skillId, error: String(err) }
        });

        return {
          skillId,
          allowed: true,
          scanResult: {
            skillId,
            score: 50,
            riskScore: 50,
            verdict: 'warn',
            findings: [],
            categories: [],
            scannedAt: new Date().toISOString(),
            linesScanned: 0,
            source: 'pre-install'
          },
          reason: 'Source fetch failed — scan skipped'
        };
      }
    }

    const scanResult = skillScanner.scan(skillId, source, { source: 'pre-install' });

    let allowed: boolean;
    let reason: string;

    switch (scanResult.verdict) {
      case 'safe':
        allowed = true;
        reason = `Scan passed (score ${scanResult.score}/100)`;
        log.info(`Skill approved: "${skillId}"`, { score: scanResult.score });
        break;

      case 'warn':
        // Warn — user must explicitly confirm (via --force flag or interactive prompt)
        allowed = false;
        reason = this.formatWarnMessage(scanResult);
        log.warn(`Skill flagged: "${skillId}"`, {
          score: scanResult.score,
          findings: scanResult.findings.length,
          categories: scanResult.categories
        });

        eventBus.emit('clawhub:install-warned', {
          source: 'clawhub-scanner',
          severity: 'warn',
          category: 'supply_chain',
          description: `Skill "${skillId}" has suspicious patterns — user confirmation required`,
          payload: { skillId, score: scanResult.score, categories: scanResult.categories }
        });
        break;

      case 'block':
        allowed = false;
        reason = this.formatBlockMessage(scanResult);
        log.warn(`Skill blocked: "${skillId}"`, {
          score: scanResult.score,
          findings: scanResult.findings.map(f => f.id)
        });

        eventBus.emit('clawhub:install-blocked', {
          source: 'clawhub-scanner',
          severity: 'block',
          category: 'supply_chain',
          description: `Malicious skill install blocked: "${skillId}" (score ${scanResult.score}/100)`,
          payload: {
            skillId,
            score: scanResult.score,
            blockingFindings: scanResult.findings
              .filter(f => f.severity === 'block')
              .map(f => ({ id: f.id, description: f.description }))
          }
        });
        break;
    }

    return { skillId, allowed, scanResult, reason };
  }

  // Record skill hashes after a confirmed install
  recordInstall(skillId: string, skillDir: string): void {
    if (!fs.existsSync(skillDir)) {
      log.warn(`Cannot record hashes — skill directory not found`, { skillDir });
      return;
    }

    const files = this.findSkillFiles(skillDir);
    let recorded = 0;

    for (const filePath of files) {
      try {
        hashVerifier.record(skillId, filePath);
        recorded++;
      } catch (err) {
        log.warn(`Failed to hash ${filePath}`, { error: String(err) });
      }
    }

    log.info(`Hashes recorded for skill "${skillId}"`, { files: recorded });
  }

  private async fetchSkillSource(skillId: string): Promise<string> {
    const url = `${CLAWHUB_API}/skills/${encodeURIComponent(skillId)}/source`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'Accept': 'text/plain, application/javascript' }
    });

    if (!res.ok) {
      throw new Error(`ClawHub API returned ${res.status} for skill "${skillId}"`);
    }

    return res.text();
  }

  private formatWarnMessage(result: ScanResult): string {
    const top = result.findings.slice(0, 3).map(f => `  • ${f.description}`).join('\n');
    return [
      `ClawSentinel detected suspicious patterns in "${result.skillId}" (score ${result.score}/100):`,
      top,
      result.findings.length > 3 ? `  • … and ${result.findings.length - 3} more` : '',
      'Use --force to install anyway (not recommended).'
    ].filter(Boolean).join('\n');
  }

  private formatBlockMessage(result: ScanResult): string {
    const blocking = result.findings.filter(f => f.severity === 'block');
    const top = blocking.slice(0, 5).map(f => `  • [${f.id}] ${f.description}`).join('\n');
    return [
      `ClawSentinel BLOCKED install of "${result.skillId}" — malicious patterns found:`,
      top,
      `This skill cannot be installed. Report it at https://clawhub.ai/report`
    ].join('\n');
  }

  private findSkillFiles(skillDir: string): string[] {
    const scanExtensions = new Set(['.js', '.ts', '.mjs', '.cjs', '.json']);
    const files: string[] = [];

    const walk = (dir: string, depth: number): void => {
      if (depth > 3) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && entry.name !== 'node_modules') {
            walk(fullPath, depth + 1);
          } else if (entry.isFile() && scanExtensions.has(path.extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch { /* skip unreadable dirs */ }
    };

    walk(skillDir, 0);
    return files;
  }
}

export const installInterceptor = new InstallInterceptor();
