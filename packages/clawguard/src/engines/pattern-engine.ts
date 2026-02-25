import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load rule files
const injectionPatterns = require('../rules/injection-patterns.json') as RuleDefinition[];
const exfilPatterns = require('../rules/exfil-patterns.json') as RuleDefinition[];

interface RuleDefinition {
  id: string;
  pattern: string;
  weight: number | string;
  category: string;
  description: string;
}

interface CompiledRule {
  id: string;
  pattern: RegExp;
  weight: number;
  category: string;
  description: string;
}

export interface PatternMatch {
  id: string;
  category: string;
  description: string;
  weight: number;
}

export interface PatternResult {
  score: number;           // 0–100 normalised
  matches: PatternMatch[];
  categories: string[];
  rawScore: number;
}

export class PatternEngine {
  private rules: CompiledRule[] = [];

  constructor() {
    const allRules: RuleDefinition[] = [...injectionPatterns, ...exfilPatterns];

    for (const rule of allRules) {
      try {
        this.rules.push({
          id: rule.id,
          pattern: new RegExp(rule.pattern, 'gi'),
          weight: Number(rule.weight),
          category: rule.category,
          description: rule.description
        });
      } catch {
        // Invalid regex — skip, log at startup
        process.stderr.write(`[PatternEngine] Invalid regex for rule ${rule.id}: ${rule.pattern}\n`);
      }
    }
  }

  scan(content: string): PatternResult {
    const matches: PatternMatch[] = [];
    const categories = new Set<string>();
    let rawScore = 0;

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0; // Reset regex state (global flag)
      if (rule.pattern.test(content)) {
        matches.push({
          id: rule.id,
          category: rule.category,
          description: rule.description,
          weight: rule.weight
        });
        categories.add(rule.category);
        rawScore += rule.weight;
      }
    }

    // Normalise: cap at 100 with non-linear scaling to penalise multi-match
    // Multiple matches from different categories signal higher confidence injection
    const categoryBonus = categories.size > 1 ? (categories.size - 1) * 0.15 : 0;
    const score = Math.min(100, Math.round(rawScore * (1 + categoryBonus)));

    return {
      score,
      matches,
      categories: Array.from(categories),
      rawScore
    };
  }

  getRuleCount(): number {
    return this.rules.length;
  }
}

export const patternEngine = new PatternEngine();
