# Changelog

All notable changes to ClawSentinel are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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

### [0.2.0] — Sprint 2: ClawGuard Proxy Core
- WebSocket transparent proxy on :18790 → :18789
- Pattern engine with 100+ injection signatures
- Taint tracker: external vs internal content classification
- Risk scorer + audit log integration
- HTTP proxy for /tools/invoke interception

### [0.3.0] — Sprint 3: ClawHub Scanner
- Pre-install skill static analysis
- Shell, HTTP, obfuscation, and permission rule sets
- `openclaw skill install` shim/interceptor
- Continuous hash monitoring for installed skills

### [0.4.0] — Sprint 4: ClawEye Dashboard
- Next.js 14 real-time security dashboard
- Server-Sent Events for live event feed
- Correlation engine: multi-step attack detection
- Module health panel + security score

### [0.5.0] — Sprint 5: Semantic Engine + Full Integration
- LLM-assisted injection detection (BYOK — user's own Anthropic/OpenAI key)
- Semantic caching to minimise API quota usage
- 500+ pattern signatures
- Full attack suite: T1–T7 threat model coverage

### [1.0.0] — Sprint 6: Launch
- `clawsentinel init` interactive wizard
- npm publish @clawsentinel/core, @clawsentinel/cli
- Standalone binary (pkg)
- SECURITY.md responsible disclosure policy
