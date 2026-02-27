// Load all rule files — order matters for rule ID display but not scoring
// Static imports so esbuild inlines the JSON into the bundle (no runtime path resolution)
import _injectionPatterns       from '../rules/injection-patterns.json';
import _exfilPatterns            from '../rules/exfil-patterns.json';
import _memoryPatterns           from '../rules/memory-patterns.json';
import _toolAbusePatterns        from '../rules/tool-abuse-patterns.json';
import _encodingPatterns         from '../rules/encoding-patterns.json';
import _multilingualPatterns     from '../rules/multilingual-patterns.json';
import _socialEngineeringPatterns from '../rules/social-engineering-patterns.json';
import _contextManipPatterns     from '../rules/context-manipulation-patterns.json';

const injectionPatterns        = _injectionPatterns        as unknown as RuleDefinition[];
const exfilPatterns             = _exfilPatterns             as unknown as RuleDefinition[];
const memoryPatterns            = _memoryPatterns            as unknown as RuleDefinition[];
const toolAbusePatterns         = _toolAbusePatterns         as unknown as RuleDefinition[];
const encodingPatterns          = _encodingPatterns          as unknown as RuleDefinition[];
const multilingualPatterns      = _multilingualPatterns      as unknown as RuleDefinition[];
const socialEngineeringPatterns = _socialEngineeringPatterns as unknown as RuleDefinition[];
const contextManipPatterns      = _contextManipPatterns      as unknown as RuleDefinition[];

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
    const allRules: RuleDefinition[] = [
      ...injectionPatterns,
      ...exfilPatterns,
      ...memoryPatterns,
      ...toolAbusePatterns,
      ...encodingPatterns,
      ...multilingualPatterns,
      ...socialEngineeringPatterns,
      ...contextManipPatterns,
    ];

    for (const rule of allRules) {
      try {
        this.rules.push({
          id: rule.id,
          pattern: new RegExp(rule.pattern, 'giu'),
          weight: Number(rule.weight),
          category: rule.category,
          description: rule.description
        });
      } catch {
        // Invalid regex — skip and log at startup
        process.stderr.write(`[PatternEngine] Invalid regex for rule ${rule.id}: ${rule.pattern}\n`);
      }
    }
  }

  scan(content: string): PatternResult {
    const matches: PatternMatch[] = [];
    const categories = new Set<string>();
    let rawScore = 0;

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0; // Reset global regex state
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

    // Normalise: non-linear scaling with category diversity penalty
    // Multiple matches from different categories = higher confidence injection
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

  // Returns all rules as plain objects for the Chrome extension /api/rules endpoint
  getRules(): RuleDefinition[] {
    return this.rules.map(r => ({
      id: r.id,
      pattern: r.pattern.source,
      weight: r.weight,
      category: r.category,
      description: r.description
    }));
  }

  getRulesByCategory(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const rule of this.rules) {
      counts[rule.category] = (counts[rule.category] ?? 0) + 1;
    }
    return counts;
  }
}

export const patternEngine = new PatternEngine();
