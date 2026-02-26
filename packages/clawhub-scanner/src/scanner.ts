// ClawHub Scanner — Static Analysis Engine
// Scans OpenClaw skill source code before install and on change

import { moduleLogger } from '@clawsentinel/core';
import { SHELL_PATTERNS, type ScanRule } from './rules/shell-patterns.js';
import { HTTP_PATTERNS } from './rules/http-patterns.js';
import { OBFUSCATION_PATTERNS } from './rules/obfuscation-patterns.js';
import { PERMISSION_RULES } from './rules/permission-rules.js';

const log = moduleLogger('clawhub-scanner:scanner');

export interface ScanFinding {
  id: string;
  category: string;
  description: string;
  severity: 'warn' | 'block';
  weight: number;
  lineNumber?: number;
  snippet?: string;
}

export interface ScanResult {
  skillId: string;
  skillName?: string;
  score: number;          // 0–100, lower = more risky (inverted from ClawGuard)
  riskScore: number;      // 0–100, higher = more risky (raw accumulation)
  verdict: 'safe' | 'warn' | 'block';
  findings: ScanFinding[];
  categories: string[];
  scannedAt: string;
  linesScanned: number;
  source: 'pre-install' | 'watcher' | 'manual';
}

// Risk thresholds (raw score — sum of matched rule weights)
const BLOCK_THRESHOLD = 15;  // Any block-severity finding, or raw score ≥ 15
const WARN_THRESHOLD  = 5;   // Raw score ≥ 5

const ALL_RULES: ScanRule[] = [
  ...SHELL_PATTERNS,
  ...HTTP_PATTERNS,
  ...OBFUSCATION_PATTERNS,
  ...PERMISSION_RULES
];

export class SkillScanner {
  private rules: Array<{ rule: ScanRule; pattern: RegExp }>;

  constructor() {
    // Pre-compile all patterns, skip invalid ones
    this.rules = [];
    for (const rule of ALL_RULES) {
      try {
        // Rules already have RegExp objects — clone with 'gim' flags for line scanning
        const src = rule.pattern.source;
        const compiled = new RegExp(src, 'gim');
        this.rules.push({ rule, pattern: compiled });
      } catch {
        log.warn(`Invalid pattern in rule ${rule.id} — skipped`);
      }
    }
    log.info(`SkillScanner loaded ${this.rules.length} rules across 4 categories`);
  }

  scan(skillId: string, sourceCode: string, options: {
    skillName?: string;
    source?: ScanResult['source'];
  } = {}): ScanResult {
    const lines = sourceCode.split('\n');
    const findings: ScanFinding[] = [];
    const categoriesHit = new Set<string>();
    let rawScore = 0;
    let hasBlock = false;

    for (const { rule, pattern } of this.rules) {
      pattern.lastIndex = 0;

      // Find all matches — track line numbers for developer-friendly output
      let match: RegExpExecArray | null;
      let firstMatch: { lineNumber: number; snippet: string } | undefined;

      while ((match = pattern.exec(sourceCode)) !== null) {
        if (!firstMatch) {
          // Calculate which line this match is on
          const upToMatch = sourceCode.slice(0, match.index);
          const lineNumber = upToMatch.split('\n').length;
          const lineContent = lines[lineNumber - 1]?.trim() ?? '';
          firstMatch = {
            lineNumber,
            snippet: lineContent.slice(0, 120)
          };
        }
        // Only record one finding per rule — avoid score inflation
        break;
      }

      if (firstMatch) {
        findings.push({
          id: rule.id,
          category: rule.category,
          description: rule.description,
          severity: rule.severity,
          weight: rule.weight,
          lineNumber: firstMatch.lineNumber,
          snippet: firstMatch.snippet
        });
        categoriesHit.add(rule.category);
        rawScore += rule.weight;
        if (rule.severity === 'block') hasBlock = true;
      }
    }

    // Category diversity bonus — multi-category findings signal coordinated attack
    const categoryBonus = categoriesHit.size > 1 ? (categoriesHit.size - 1) * 3 : 0;
    const adjustedRaw = rawScore + categoryBonus;

    // Determine verdict
    let verdict: ScanResult['verdict'];
    if (hasBlock || adjustedRaw >= BLOCK_THRESHOLD) {
      verdict = 'block';
    } else if (adjustedRaw >= WARN_THRESHOLD) {
      verdict = 'warn';
    } else {
      verdict = 'safe';
    }

    // Score = safety score (100 = perfect, 0 = dangerous)
    const score = Math.max(0, Math.round(100 - Math.min(100, adjustedRaw * 5)));

    const result: ScanResult = {
      skillId,
      ...(options.skillName !== undefined ? { skillName: options.skillName } : {}),
      score,
      riskScore: Math.min(100, adjustedRaw),
      verdict,
      findings,
      categories: Array.from(categoriesHit),
      scannedAt: new Date().toISOString(),
      linesScanned: lines.length,
      source: options.source ?? 'manual'
    };

    log.info(`Scanned skill "${skillId}"`, {
      verdict,
      score,
      findings: findings.length,
      categories: Array.from(categoriesHit)
    });

    return result;
  }

  getRuleCount(): number {
    return this.rules.length;
  }

  getRulesByCategory(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const { rule } of this.rules) {
      counts[rule.category] = (counts[rule.category] ?? 0) + 1;
    }
    return counts;
  }
}

export const skillScanner = new SkillScanner();
