// ClawGuard library entry point — safe to import without starting the proxy process.
// Exports the PatternEngine and related types for use by other packages (e.g. CLI scan command).

export { PatternEngine, patternEngine } from './engines/pattern-engine.js';
export type { PatternMatch, PatternResult } from './engines/pattern-engine.js';
