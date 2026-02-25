# Changelog

All notable changes to ClawSentinel are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.3.0] — Sprint 3: ClawHub Scanner + Chrome Extension

### Added
- `packages/clawhub-scanner` — full supply chain protection module (v0.3.0)
- `src/scanner.ts` — `SkillScanner` static analysis engine: 60+ rules across 4 categories, line-number-aware findings, multi-category risk bonus, 0–100 safety score
- `src/rules/shell-patterns.ts` — 18 shell execution rules: exec/spawn/execSync, reverse shells (/dev/tcp, mkfifo, nc), persistence (cron, launchctl, systemctl), destructive commands (rm -rf)
- `src/rules/http-patterns.ts` — 12 outbound HTTP rules: non-allowlisted domains, env var exfil fetch, credential-in-URL patterns, SSRF (private IPs, loopback), .onion, image beacons, obfuscated endpoints
- `src/rules/obfuscation-patterns.ts` — 15 obfuscation rules: eval, new Function, atob/Buffer.from base64, vm.runInThisContext, hex/unicode escape sequences, constructor bypass, dynamic require
- `src/rules/permission-rules.ts` — 18 permission rules: credential file access (~/.ssh, ~/.aws, ~/.openclaw, ~/.gnupg, ~/.kube), AI API key env vars, environment bulk dump, /proc and /etc access, embedded injection payloads in skill prompts, native .node addon loading
- `src/hash-verifier.ts` — SHA-256 hash recording + post-install tamper detection; persists to SQLite
- `src/watcher.ts` — chokidar-based continuous monitoring of `~/.openclaw/skills/`; debounced re-scan on change; tamper alert via eventBus on hash mismatch
- `src/interceptor.ts` — `InstallInterceptor`: fetches skill source from ClawHub API, runs full scan, emits `clawhub:install-blocked` / `clawhub:install-warned` / `clawhub:scan-failed` events; records hashes post-install
- `packages/extension` — Chrome Extension MV3: ClawSentinel Guard (v0.3.0)
- `extension/manifest.json` — MV3 manifest: content scripts on all URLs + clawhub.ai, background service worker, storage + activeTab permissions
- `extension/content/scanner.js` — DOM injection scanner: 17 patterns, scans page HTML, text nodes, hidden elements (15+ CSS selectors), meta tags, JSON-LD, data attributes; sends result to service worker
- `extension/content/clawhub-badges.js` — ClawHub skill badge injector: queries platform API at :18791, falls back to inline scan, MutationObserver for SPA navigation, animated badge UI
- `extension/content/scanner.css` — Badge styles: safe/warning/danger/unscanned/loading states with blur backdrop and animated pulse
- `extension/background/service-worker.js` — Manages per-tab scan results, toolbar icon color and badge count, webNavigation reset on page load
- `extension/popup/popup.html` + `popup.js` + `popup.css` — Full popup UI: risk banner, findings list with severity color coding, platform online/offline indicator
- `extension/scripts/build.js` — esbuild-free build: copies static assets to dist/, generates valid PNG icons (4 colors × 3 sizes) using raw PNG construction (no external deps)
- `apps/cli/src/commands/scan.ts` — `clawsentinel scan <skill-id>` command: local file scan + ClawHub pre-install intercept, colored terminal output, `--force` flag, `--json` output
- `tests/attack-suite/t2-supply-chain.ts` — 14 malicious skill vectors + 7 safe skills + 3 definite-block tests, fully wired to SkillScanner

### Security Coverage
- T2 (Supply chain / skill poisoning): SkillScanner + HashVerifier + InstallInterceptor
- T3 (Persistent backdoor in skill): shell + cron persistence rules
- T4 (Credential theft from skill source): credential_access + http_exfil rules
- Browser-side: DOM injection scanner on every webpage visited

### Architecture
- 60+ static analysis rules with per-rule severity (warn/block), weight, line number tracking
- Category diversity bonus: multi-category findings signal coordinated attack
- Passthrough-first on fetch failure: scan errors allow install with warning (never silent block)
- Extension bridges to platform via localhost:18791/api — degrades gracefully when platform is offline
- Build script generates valid PNG icons with raw PNG construction (CRC-32, zlib deflate) — no external deps

### CLI
- New `clawsentinel scan <skill-id>` command (v0.3.0)
- CLI version bumped to 0.3.0

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
