import type { PatternResult } from './pattern-engine.js';
import type { TaintResult } from './taint-tracker.js';

export interface SemanticResult {
  isInjection: boolean;
  confidence: number;  // 0–1
  reason: string;
  provider: string;
}

export interface RiskContext {
  isTainted: boolean;
  taintRiskLevel: 'none' | 'low' | 'medium' | 'high';
  frameType: string;
  contentLength: number;
}

export interface RiskScore {
  score: number;         // 0–100 final composite score
  action: 'pass' | 'warn' | 'block';
  reason: string;
  breakdown: {
    patternScore: number;
    semanticBoost: number;
    taintMultiplier: number;
    frameTypeBoost: number;
  };
}

// Thresholds aligned with the documentation
const BLOCK_THRESHOLD = 71;
const WARN_THRESHOLD = 31;

// Taint multipliers — external content gets higher effective score
const TAINT_MULTIPLIERS: Record<string, number> = {
  none: 0.5,    // Internal content: halve the score (much lower chance of real injection)
  low: 1.0,     // Unknown source: score as-is
  medium: 1.2,  // File/tool content: 20% boost
  high: 1.4     // Web/memory content: 40% boost (primary attack vector)
};

// Frame type boosts — certain frame types are inherently higher risk
const FRAME_TYPE_BOOSTS: Record<string, number> = {
  tool_result: 5,      // External content entering context — moderate boost
  memory_read: 8,      // Memory may be poisoned — higher boost
  memory_write: 15,    // Writing to memory is T6 attack vector — significant boost
  unknown: 10,         // Unknown frame — cautious boost
  user_message: 0,
  assistant_message: 0,
  system_prompt: -5,   // System prompts are internal — lower risk
  tool_call: 3,
  user_message_with_attachment: 5
};

export class RiskScorer {
  compute(
    patternResult: PatternResult,
    semanticResult: SemanticResult | null,
    context: RiskContext
  ): RiskScore {
    const multiplier = TAINT_MULTIPLIERS[context.taintRiskLevel] ?? 1.0;
    const frameBoost = FRAME_TYPE_BOOSTS[context.frameType] ?? 0;

    // Base: pattern score adjusted for taint and frame type
    let adjustedScore = (patternResult.score * multiplier) + frameBoost;

    // Semantic boost: if LLM confirms injection, push score significantly higher
    let semanticBoost = 0;
    if (semanticResult !== null) {
      if (semanticResult.isInjection) {
        // Scale boost by confidence (0–1) and current score
        // High-confidence semantic hit on already-suspicious content → definitive block
        semanticBoost = Math.round(semanticResult.confidence * 30);
        adjustedScore += semanticBoost;
      } else if (semanticResult.confidence > 0.8) {
        // High-confidence semantic clean → reduce score
        adjustedScore = Math.max(0, adjustedScore - 10);
        semanticBoost = -10;
      }
    }

    const finalScore = Math.min(100, Math.max(0, Math.round(adjustedScore)));

    let action: RiskScore['action'];
    let reason: string;

    if (finalScore >= BLOCK_THRESHOLD) {
      action = 'block';
      reason = patternResult.matches[0]?.description
        ?? (semanticResult?.isInjection ? semanticResult.reason : 'Risk threshold exceeded');
    } else if (finalScore >= WARN_THRESHOLD) {
      action = 'warn';
      reason = `Risk score ${finalScore} — monitoring`;
    } else {
      action = 'pass';
      reason = 'Below risk threshold';
    }

    return {
      score: finalScore,
      action,
      reason,
      breakdown: {
        patternScore: patternResult.score,
        semanticBoost,
        taintMultiplier: multiplier,
        frameTypeBoost: frameBoost
      }
    };
  }
}

export const riskScorer = new RiskScorer();
