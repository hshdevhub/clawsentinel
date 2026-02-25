# Changelog

All notable changes to ClawSentinel are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.2.0] — Sprint 2: ClawGuard Proxy Core

### Added
- `packages/clawguard` — full WebSocket transparent proxy (:18790 → :18789)
- `packages/clawguard/src/proxy/ws-proxy.ts` — bidirectional WS proxy with per-session taint tracking
- `packages/clawguard/src/proxy/http-proxy.ts` — `/tools/invoke` HTTP interceptor with tool/path/domain blocklists and ClawVault credential injection
- `packages/clawguard/src/proxy/frame-parser.ts` — OpenClaw WS protocol parser, identifies content source (user/web/file/memory/tool)
- `packages/clawguard/src/engines/pattern-engine.ts` — pre-compiled regex engine (75 rules: 50 injection + 25 exfil)
- `packages/clawguard/src/engines/taint-tracker.ts` — external vs internal content classification with session-level taint propagation
- `packages/clawguard/src/engines/risk-scorer.ts` — composite scoring (pattern score × taint multiplier + frame type boost + semantic boost)
- `packages/clawguard/src/engines/semantic-engine.ts` — BYOK LLM-assisted detection (Anthropic/OpenAI/Ollama), 1-hour cache, cost-gated
- `packages/clawguard/src/rules/injection-patterns.json` — 50 injection signatures (instruction override, persona hijack, system spoof, memory tampering, unicode bypass, encoding bypass, exfiltration, multi-step, evasion)
- `packages/clawguard/src/rules/exfil-patterns.json` — 25 exfiltration signatures (curl/wget/nc, credential file access, reverse shells, image beacons, DNS exfil, cron persistence)
- `packages/clawguard/src/rules/tool-blocklist.json` — shell command + filesystem path + tool name blocklist
- `packages/clawguard/src/rules/domain-allowlist.json` — outbound HTTP domain allowlist with SSRF protection (private IP ranges blocked)
- `tests/attack-suite/t1-prompt-injection.ts` — 20 known injection attacks + 10 safe phrases wired to PatternEngine, 4 block-threshold tests

### Security Coverage
- T1 (Indirect prompt injection): PatternEngine + TaintTracker + SemanticEngine
- T5 (Tool abuse): HTTP proxy tool/shell/path blocklist
- T6 (Memory tampering): memory_write frame type boost + pattern rules
- T7 (API key exfiltration): outbound key detection in WS + HTTP

### Architecture
- Passthrough-first: any inspection failure forwards traffic unmodified — OpenClaw never breaks
- Semantic engine is cost-gated (only fires if pattern score > 30) — minimal API quota impact
- Session taint propagation: once a session receives external content, subsequent tool calls are elevated risk
- Health endpoint at :18791/health for Docker healthchecks and ClawEye status polling

---

## [0.1.0] — Sprint 1: Foundation

### Added
- Monorepo structure with npm workspaces + Turborepo
- `packages/core` — shared types, SQLite schema, event bus, structured logger, config manager
- `packages/clawvault` — AES-256-GCM encrypted credential vault with OS keychain integration
- `packages/clawbox` — hardened Docker Compose stack (OpenClaw + Traefik + Fail2ban)
- `apps/cli` — `clawsentinel` CLI with all command stubs (init, start, stop, status, logs, enable, disable, vault)
- Package stubs for `clawguard`, `clawhub-scanner`, `claweye`, `extension`
- Auto key detection: reads API keys from all known OpenClaw config locations, zero user input required
- TypeScript strict mode across all packages

### Architecture
- ClawVault uses OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager) with AES-256-GCM fallback
- Event bus persists all security events to SQLite with automatic indexing
- All modules follow passthrough-first design: failure never breaks OpenClaw

---

## Upcoming

### [0.3.0] — Sprint 3: ClawHub Scanner
- Pre-install skill static analysis
- Shell, HTTP, obfuscation, and permission rule sets
- `openclaw skill install` shim/interceptor
- Continuous hash monitoring for installed skills
- Chrome extension companion (ClawSentinel Guard)

### [0.4.0] — Sprint 4: ClawEye Dashboard
- Next.js 14 real-time security dashboard
- Server-Sent Events for live event feed
- Correlation engine: multi-step attack detection
- Module health panel + security score

### [0.5.0] — Sprint 5: Full Integration
- 500+ pattern signatures
- Full attack suite: T1–T7 threat model coverage
- End-to-end integration tests

### [1.0.0] — Sprint 6: Launch
- `clawsentinel init` interactive wizard
- npm publish @clawsentinel/core, @clawsentinel/cli
- Standalone binary (pkg)
- SECURITY.md responsible disclosure policy
