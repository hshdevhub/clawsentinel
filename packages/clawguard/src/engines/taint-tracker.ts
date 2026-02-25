// Taint tracker — classifies content as trusted (internal) or untrusted (external)
// External content (web pages, tool results, files) entering the context window
// is "tainted" and must be inspected before being passed to the agent.
//
// This is the core of ClawGuard's out-of-context enforcement:
// Rules run at the Node.js process level, not inside the context window.

import type { ContentSource, FrameType } from '../proxy/frame-parser.js';

// Sources considered untrusted — their content must be inspected
const UNTRUSTED_SOURCES = new Set<ContentSource>([
  'web',
  'file',
  'memory',  // Memory can be poisoned by previous injections
  'tool',
  'unknown'
]);

// Frame types that carry external content
const EXTERNAL_FRAME_TYPES = new Set<FrameType>([
  'tool_result',
  'memory_read',
  'memory_write',
  'unknown'
]);

export interface TaintResult {
  isTainted: boolean;
  source: ContentSource;
  reason: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
}

export class TaintTracker {
  // Per-session taint propagation: if a session has received tainted content,
  // subsequent tool calls in that session are also elevated risk
  private taintedSessions = new Map<string, { sources: ContentSource[]; since: number }>();

  classify(
    source: ContentSource,
    frameType: FrameType,
    sessionId?: string
  ): TaintResult {
    const isTaintedSource = UNTRUSTED_SOURCES.has(source);
    const isExternalFrame = EXTERNAL_FRAME_TYPES.has(frameType);

    // Check session-level taint propagation
    const sessionTainted = sessionId ? this.taintedSessions.has(sessionId) : false;

    if (!isTaintedSource && !isExternalFrame && !sessionTainted) {
      return {
        isTainted: false,
        source,
        reason: 'Internal/user content — trusted',
        riskLevel: 'none'
      };
    }

    // Record taint at session level for propagation
    if (sessionId && (isTaintedSource || isExternalFrame)) {
      const existing = this.taintedSessions.get(sessionId);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      } else {
        this.taintedSessions.set(sessionId, { sources: [source], since: Date.now() });
      }
    }

    // Calculate risk level
    let riskLevel: TaintResult['riskLevel'] = 'low';
    let reason = '';

    if (source === 'web') {
      riskLevel = 'high';
      reason = 'Web content — primary injection vector (indirect prompt injection)';
    } else if (source === 'memory') {
      riskLevel = 'high';
      reason = 'Memory content — may contain persistent backdoor payloads';
    } else if (frameType === 'memory_write') {
      riskLevel = 'high';
      reason = 'Memory write — potential persistence attack vector (T6)';
    } else if (source === 'file') {
      riskLevel = 'medium';
      reason = 'File content — may contain injected instructions';
    } else if (source === 'tool') {
      riskLevel = 'medium';
      reason = 'Tool result — external content entering context window';
    } else if (sessionTainted) {
      riskLevel = 'low';
      reason = 'Session previously received tainted content — elevated risk';
    } else {
      riskLevel = 'low';
      reason = 'Unknown source — treat as untrusted';
    }

    return { isTainted: true, source, reason, riskLevel };
  }

  // Clean up stale session taint records (older than 1 hour)
  pruneStaleRecords(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [sessionId, record] of this.taintedSessions) {
      if (record.since < cutoff) this.taintedSessions.delete(sessionId);
    }
  }

  getSessionTaintInfo(sessionId: string) {
    return this.taintedSessions.get(sessionId) ?? null;
  }
}

export const taintTracker = new TaintTracker();
