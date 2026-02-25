# Changelog

All notable changes to ClawSentinel are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.7.0] — Sprint 7: Billing & Pro Plan

### Added
- **`clawsentinel activate <key>`** — Exchanges a refresh_token for a 24h signed JWT. Locks the token to the current machine via a SHA-256 fingerprint (hostname + platform + username + CPU model). Sharing a token to another machine auto-revokes the original owner's access within 24 hours.
- **`clawsentinel billing status`** — Displays current plan (Free / Pro), account email, and hours remaining on the access token.
- **`clawsentinel billing portal`** — Opens the Stripe billing portal in the default browser (cancel, update card, view invoices).
- **`clawsentinel upgrade`** — Opens the Stripe checkout page (7-day free trial, then $9/month). No-ops if already on Pro.
- **Background plan renewal** — ClawGuard silently renews the Pro access token every 23 hours at startup. Uses `POST /api/renew` with `refresh_token` + `machine_id`. If the subscription is cancelled, the plan downgrades to Free automatically within 24 hours — no user action needed.
- **`getMachineId()`** exported from `@clawsentinel/core` — shared machine fingerprint utility used by both `activate` and ClawGuard renewal.
- **Vercel API backend** (`apps/api/`) — 4 serverless endpoints: `/api/webhook` (Stripe events), `/api/activate`, `/api/renew`, `/api/checkout`. Backed by Upstash Redis. Sends activation emails via Resend.

### Pro plan enforcement
- **Semantic engine** (`clawguard`) — `isPro()` gate; LLM analysis is skipped for Free users (pattern-only protection still applies).
- **Correlation engine** (`claweye`) — `isPro()` gate in the SSE stream route; `CorrelationEngine.evaluate()` is not instantiated for Free users.
- Free plan still receives all 500-rule pattern protection, WS/HTTP blocking, ClawHub scanning, and ClawVault encryption.

### License
- Changed from **MIT** to **Elastic License 2.0 (ELv2)**: open source, self-host permitted, but circumventing plan checks or re-hosting as a managed service is prohibited.

### Version bumps
- All packages 0.6.1 → 0.7.0 (`core`, `clawguard`, `clawvault`, `clawhub-scanner`, `claweye`, CLI)
- `apps/api` introduced at 0.7.0

---

## [0.6.1] — Sprint 6c: Polish + Monitor Mode

### Added
- `clawsentinel config` — full config management command with `list`, `get`, `set`, `reset` subcommands; dot-path notation for nested keys (e.g. `clawguard.mode`, `semanticEngine.enabled`)
- `clawsentinel uninstall` — graceful teardown: stops all running modules (SIGTERM), removes event DB and `~/.clawsentinel/` directory; `--keep-db` flag to preserve logs; interactive confirmation with `--yes` bypass
- `clawguard.mode` config key — `enforce` (default, blocks attacks) or `monitor` (alerts only, never blocks); enables safe deployment in sensitive environments

### Fixed
- **Passthrough-first semantic engine**: ClawGuard no longer awaits LLM analysis before forwarding messages. Pattern score ≥ blockThreshold → block immediately. Pattern score in warn range → pass message through immediately, run LLM async, emit `clawguard:semantic-confirm` event if injection confirmed retroactively. Zero LLM latency on the critical path.
- Monitor mode applied consistently in all score branches: high-score blocks, mid-range blocks, and pattern-only blocks all honour `clawguard.mode = monitor`

### Schema
- `config.ts` — added `clawguard.mode: 'enforce' | 'monitor'` field (default `'enforce'`)

### Version bumps
- All core packages 0.6.0 → 0.6.1
- Internal workspace deps updated to `^0.6.1`

---

## [0.6.0] — Sprint 6: Launch Prep

### Added
- `SECURITY.md` — responsible disclosure policy, vulnerability reporting process, response timeline, scope, security architecture overview
- `.env.example` (root) — documents all ClawSentinel environment variables with defaults
- `packages/clawguard/.env.example` — ClawGuard-specific env vars (ports, upstream, semantic engine mode)
- `packages/claweye/.env.example` — ClawEye dashboard env vars (port, DB path, SSE poll interval)

### CLI
- `clawsentinel init` — fully rewritten interactive setup wizard with ANSI colour output (cyan banners, green ✓, yellow ⚠), step progress `[1/4]`, DB initialisation step, version updated to 0.6.0
- `clawsentinel status` — color-coded module health: ● green (running), ● red (error), ○ yellow (stopped), ○ grey (disabled); shows plan badge, timestamp, contextual hint (start vs logs vs error)
- CLI version bumped to 0.6.0

### npm Publish Config
- All publishable packages updated with `publishConfig`, `files`, `repository`, `homepage`, `license`, `keywords`, `engines` fields ready for `npm publish`
- Packages: `@clawsentinel/core`, `@clawsentinel/clawguard`, `@clawsentinel/clawvault`, `@clawsentinel/clawhub-scanner`, `clawsentinel` (CLI)
- Internal workspace deps updated from `"*"` to `"^0.6.0"` for proper semver resolution on npm
- `clawguard` `files` field includes `src/rules/` so the 500 JSON rule files are bundled with the package

### README
- Rewrote with full architecture diagram, 60-second install guide, threat coverage table, pattern engine detail (8 categories, 500 rules), CLI reference, attack test suite example output, BYOK provider priority list
- Fixed rule count (500, not 1,247)
- Added `clawsentinel test --attack-suite` to CLI reference

### Version bumps
- `@clawsentinel/core` 0.1.0 → 0.6.0
- `@clawsentinel/clawguard` 0.1.0 → 0.6.0
- `@clawsentinel/clawvault` 0.1.0 → 0.6.0
- `@clawsentinel/clawhub-scanner` 0.3.0 → 0.6.0
- `clawsentinel` CLI 0.5.0 → 0.6.0

---

## [0.5.0] — Sprint 5: Semantic Engine + 500-Rule Pattern Library + Full Attack Suite

### Added
- `packages/clawguard/src/rules/memory-patterns.json` — 60 rules: T6 memory tampering (memory_write, memory_poison, persistent_injection, memory_exfil, rag_injection, training_poisoning)
- `packages/clawguard/src/rules/tool-abuse-patterns.json` — 50 rules: T5 tool abuse (filesystem_abuse, shell_abuse, network_tool_abuse, computer_use_abuse, cloud_credential_abuse, tool_chaining, tool_hijack, vault_tool_abuse, privilege_escalation, auth_bypass)
- `packages/clawguard/src/rules/encoding-patterns.json` — 75 rules: encoding bypass (base64_encoded, hex_encoded, unicode_escape, url_encoded, js_obfuscation, python_encoding, steganography, shellcode, wasm_execution, prototype_pollution, xxe_injection, ssrf, template_injection, ldap_injection)
- `packages/clawguard/src/rules/multilingual-patterns.json` — 75 rules: injection patterns in 15+ languages (Spanish, French, German, Chinese, Russian, Japanese, Portuguese, Arabic, Korean, Italian, Dutch, Scandinavian, Finnish, Greek, Turkish, Hindi, Thai, Polish, Hungarian, Ukrainian)
- `packages/clawguard/src/rules/social-engineering-patterns.json` — 60 rules: social engineering (urgency_manipulation, authority_appeal, trust_exploitation, framing_attack, false_consent, coercion, gradual_escalation, foot_in_door, impersonation, dual_persona, safety_probing)
- `packages/clawguard/src/rules/context-manipulation-patterns.json` — 50 rules: context attacks (context_boundary_injection, message_type_spoof, false_attribution, rag_injection, fragmented_injection, multi_agent_attack, human_oversight_bypass, logic_bomb, persistence, delayed_execution)
- **Total: 500 detection rules** across all 8 rule files in ClawGuard (up from 75 in Sprint 2)

### Pattern Engine
- `packages/clawguard/src/engines/pattern-engine.ts` — updated to load all 8 rule files; regex flag upgraded to `giu` for Unicode support

### Attack Test Suite
- `tests/attack-suite/t3-open-dm.ts` — T3: Indirect context injection via emails, documents, chat messages, API responses, RAG results (15 attack vectors + 8 safe phrases)
- `tests/attack-suite/t5-tool-abuse.ts` — T5: Tool abuse via shell, file, HTTP, code execution, MCP, vault, container/cloud tools (22 attack vectors + 6 safe phrases)
- `tests/attack-suite/t6-memory-tampering.ts` — T6: Memory poisoning, RAG injection, cross-session persistence, memory exfil, logic bombs (21 attack vectors + 6 safe phrases)
- `tests/attack-suite/t7-credential-theft.ts` — T7: SSH/AWS/API key exfil, env var theft, browser credential theft, outbound response scanning (28 attack vectors + 6 safe phrases)

### Semantic Engine
- Fully operational from Sprint 2 (BYOK: Anthropic → OpenAI → Ollama → pattern-only fallback)
- Wired into ClawGuard WS proxy — triggered at pattern score > 30 (cost gate)
- In-process LRU cache (1h TTL, max 500 entries) — minimizes API calls

### CLI
- New `clawsentinel test --attack-suite` command — runs all 6 threat models (T1-T7)
- `--threat T1/T2/T3/T5/T6/T7` — run specific threat model
- `--json` — machine-readable output for CI
- `--fail-fast` — stop on first failing threat model
- Per-threat pass/fail counts and duration
- Summary: threat models passed + total test cases
- CLI version bumped to 0.5.0

---

## [0.4.0] — Sprint 4: ClawEye Security Dashboard

### Added
- `packages/claweye` — full real-time security dashboard (Next.js 14 App Router, v0.4.0)
- `src/correlation.ts` — `CorrelationEngine` with 7 detection rules:
  - CORR001: full kill chain (skill warn + injection + credential access within 30 min)
  - CORR002: memory exfil + outbound URL in same session
  - CORR003: vault credential probing (3+ vault denial events)
  - CORR004: persistent attacker (3+ block events within 5 min)
  - CORR005: tool exfil chain (tool blocked + exfiltration event)
  - CORR006: supply chain tamper detection
  - CORR007: rapid attack burst (10+ non-info events in 60s sliding window)
- `app/api/events/stream/route.ts` — SSE endpoint polling SQLite every 2s; runs correlation engine on each poll; ping keep-alive when idle; graceful DB-not-initialized handling
- `app/api/events/route.ts` — REST paginated audit log (limit/severity/source/since filters, max 500 events)
- `app/api/status/route.ts` — Module health endpoint: parallel liveness checks for ClawGuard + ClawEye, merges DB module_status table; returns 5-module status array
- `app/api/stats/route.ts` — Aggregate stats: severity counts, top 5 threat categories, hourly sparkline data (total + blocked), security score formula (100 - critical×20 - block×5 - warn×1)
- `app/api/skills/scan-result/route.ts` — Chrome extension bridge: serves cached skill scans from skill_scans table with CORS headers
- `app/components/EventFeed.tsx` — Live SSE-based event feed: severity filtering, pause/resume, expandable rows with category/sessionId, max 200 events in memory
- `app/components/LayerStatus.tsx` — 5-module health panel: live status dots, port labels, 10s refresh cycle
- `app/components/SecurityScore.tsx` — Security score SVG arc gauge: color-coded (green/yellow/orange/red), severity pill counts, top 3 threat category bars, 30s refresh
- `app/components/CorrelationAlerts.tsx` — Correlation alert cards: SSE + REST initial load, expandable sessionId, severity-bordered cards
- `app/components/StatsBar.tsx` — Top stats bar: total events / blocked / critical / score + hourly activity sparkline (blocked events highlighted as red dots)
- `app/layout.tsx` — Root Next.js layout with dark theme metadata
- `app/page.tsx` — Main dashboard: 3-column layout (left: score+modules, centre: event feed, right: correlation alerts) + top stats bar
- `app/globals.css` — Tailwind base, dark scrollbar, slide-in / pulse-slow animations, focus rings

### Architecture
- Cross-process event delivery via shared SQLite polling (SSE stream polls every 2s) — works with ClawGuard and ClawHub as separate processes
- Correlation engine runs server-side on each SSE poll tick; deduplicates alerts with 10-min window
- All routes use `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` for SQLite compatibility with Next.js
- Security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer
- CORS for ClawHub Scanner skill scan API (extension access from localhost:18791)

### CLI
- `start` command now spawns ClawEye (`next start -p 7432`) and ClawGuard as child processes
- `--no-eye` flag to skip ClawEye startup
- `-m claweye` / `-m clawguard` for individual module start
- CLI version bumped to 0.4.0

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

### [0.7.0] — Sprint 7: Subscriptions + Stripe
- Free + Pro ($9/mo) plan gating
- Stripe Checkout integration (`clawsentinel upgrade`)
- ClawEye Pro-only gate with upgrade prompt overlay
- 90-day log retention for Pro (7-day for Free)
- Stripe Customer Portal for self-serve cancellation
