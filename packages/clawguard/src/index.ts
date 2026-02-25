// ClawGuard — Sprint 2 (v0.2.0)
// WebSocket transparent proxy + HTTP proxy + pattern/semantic injection firewall
//
// Modules to be built:
//   proxy/ws-proxy.ts         ← WebSocket transparent proxy (:18790 → :18789)
//   proxy/http-proxy.ts       ← /tools/invoke HTTP interceptor
//   proxy/frame-parser.ts     ← OpenClaw WS protocol parser
//   engines/pattern-engine.ts ← Pattern matching (1,247 signatures)
//   engines/semantic-engine.ts← LLM-assisted detection (BYOK)
//   engines/taint-tracker.ts  ← External vs internal content classification
//   engines/risk-scorer.ts    ← Composite risk scoring
//   rules/injection-patterns.json
//   rules/exfil-patterns.json
//   rules/tool-blocklist.json
//   rules/domain-allowlist.json

export const CLAWGUARD_VERSION = '0.1.0';
export const CLAWGUARD_STATUS = 'pending-sprint-2';
