// ClawHub Scanner — Module Entry Point (v0.3.0)
// Pre-install skill scanner + continuous monitoring + supply chain protection

export { SkillScanner, skillScanner } from './scanner.js';
export type { ScanResult, ScanFinding } from './scanner.js';

export { HashVerifier, hashVerifier } from './hash-verifier.js';
export type { VerifyResult } from './hash-verifier.js';

import { skillWatcher } from './watcher.js';
export { SkillWatcher, skillWatcher } from './watcher.js';
export type { WatcherStats } from './watcher.js';

export { InstallInterceptor, installInterceptor } from './interceptor.js';
export type { InterceptResult } from './interceptor.js';

export { SHELL_PATTERNS } from './rules/shell-patterns.js';
export type { ScanRule } from './rules/shell-patterns.js';
export { HTTP_PATTERNS } from './rules/http-patterns.js';
export { OBFUSCATION_PATTERNS } from './rules/obfuscation-patterns.js';
export { PERMISSION_RULES } from './rules/permission-rules.js';

export const CLAWHUB_SCANNER_VERSION = '0.3.0';

// Convenience: start all scanner subsystems
export function startClawHubScanner(): void {
  skillWatcher.start();
}
