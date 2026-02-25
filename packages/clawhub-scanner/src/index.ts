// ClawHub Scanner — Sprint 3 (v0.3.0)
// Pre-install skill scanner + continuous monitoring + openclaw skill install interceptor
//
// Modules to be built:
//   scanner.ts                ← Static analysis engine (shell, http, obfuscation, permissions)
//   rules/shell-patterns.ts   ← Shell execution pattern rules
//   rules/http-patterns.ts    ← Outbound HTTP call detection
//   rules/obfuscation-patterns.ts ← Base64, eval, encoding bypass detection
//   rules/permission-rules.ts ← Over-permission detection
//   watcher.ts                ← Continuous skill hash monitoring (chokidar)
//   hash-verifier.ts          ← Dependency integrity verification
//   interceptor.ts            ← openclaw skill install shim

export const CLAWHUB_SCANNER_VERSION = '0.1.0';
export const CLAWHUB_SCANNER_STATUS = 'pending-sprint-3';
