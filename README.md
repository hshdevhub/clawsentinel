# ClawSentinel

**The active security layer for OpenClaw. One install. Five layers. Complete protection.**

> OpenClaw is a powerful local AI agent — but it was built for capability, not security. ClawSentinel is the security platform it was never shipped with.

[![npm version](https://img.shields.io/npm/v/clawsentinel.svg)](https://www.npmjs.com/package/clawsentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

---

## Why ClawSentinel

OpenClaw gained 8 CVEs within 3 weeks of going viral — including a critical RCE, supply-chain poisoning, and prompt injection attacks. Every existing security tool for OpenClaw has the same fundamental flaw: **their rules live inside the agent context window**, meaning a single injection can disable them entirely.

ClawSentinel runs **outside** the agent at the Node.js process level. No prompt injection can reach it. No injected instruction can turn it off.

---

## 60-Second Install

```bash
# Install globally
npm install -g clawsentinel

# Run the interactive setup wizard
clawsentinel init

# Start all five security layers
clawsentinel start
```

That's it. ClawSentinel auto-detects your OpenClaw installation and API keys. Zero manual configuration required.

Point your OpenClaw client to `:18790` instead of `:18789` — everything else stays the same.

```bash
# Before ClawSentinel — clients connect to:
ws://127.0.0.1:18789

# After ClawSentinel — clients connect to:
ws://127.0.0.1:18790   ← ClawSentinel proxy (forwards to :18789)
```

---

## Five Layers of Protection

```
External world
      ↓
┌─────────────────────────────────────────────────┐
│  ClawBox       Hardened Docker deployment        │
│                Locked defaults, TLS, rate limits │
├─────────────────────────────────────────────────┤
│  ClawHub       Pre-install skill scanner         │
│  Scanner       Supply chain protection           │
├─────────────────────────────────────────────────┤
│  ClawVault     Encrypted credential store        │
│                AES-256-GCM + OS keychain         │
├─────────────────────────────────────────────────┤
│  ClawGuard     WebSocket + HTTP proxy            │
│                Prompt injection firewall         │
│                500 pattern signatures            │
│                Semantic LLM-assisted detection   │
├─────────────────────────────────────────────────┤
│  ClawEye       Real-time security dashboard      │
│                Correlation engine                │
│                Multi-step attack detection       │
└─────────────────────────────────────────────────┘
      ↓
OpenClaw Agent (protected)
```

---

## Threat Coverage

| ID | Threat | Module | Status |
|----|--------|--------|--------|
| T1 | Indirect prompt injection | ClawGuard | ✅ |
| T2 | Supply chain / skill poisoning | ClawHub Scanner | ✅ |
| T3 | Indirect context injection (emails, docs, APIs) | ClawGuard | ✅ |
| T4 | Canvas XSS | ClawBox | ✅ |
| T5 | Tool abuse (shell, filesystem, HTTP, MCP) | ClawGuard | ✅ |
| T6 | Persistent memory tampering | ClawGuard + ClawEye | ✅ |
| T7 | API key / credential exfiltration | ClawVault + ClawGuard | ✅ |

---

## How It Works

### ClawGuard — The Core Firewall

ClawGuard wraps OpenClaw as a **transparent WebSocket + HTTP proxy**. Every message passes through a three-stage inspection pipeline:

```
Inbound message
      ↓
[1] Pattern Engine — 500 pre-compiled regex rules (8 categories)
      ↓
[2] Taint Tracker — marks sessions that received external content
      ↓
[3] Semantic Engine — LLM-assisted analysis (cost-gated, only fires if pattern score > 30)
      ↓
Allow / Block / Warn
```

**500 detection rules** across 8 categories:
- `injection` — instruction override, persona hijack, system spoof, unicode bypass
- `exfiltration` — curl/wget/nc, credential file access, reverse shells, DNS exfil
- `memory_write` — T6 memory tampering, RAG/vector store poisoning, cross-session persistence
- `tool_abuse` — shell, file system, HTTP client, MCP server, cloud credential abuse
- `encoding` — base64, hex, unicode escape, URL encoding, JS obfuscation, steganography
- `multilingual` — injection patterns in 15+ languages (ES, FR, DE, ZH, RU, JA, PT, AR, KO, IT…)
- `social_engineering` — urgency manipulation, authority appeal, trust exploitation, impersonation
- `context_manipulation` — context boundary injection, RAG injection, fragmented injection, logic bombs

### ClawVault — Encrypted Credentials

Stores your API keys encrypted at rest with AES-256-GCM. The encryption key is derived using PBKDF2 and stored in the OS keychain — never written to disk in plaintext. ClawGuard reads keys from ClawVault at startup via IPC, not environment variables.

### ClawHub Scanner — Supply Chain Protection

Intercepts OpenClaw skill installations and performs static analysis before allowing them to run:
- 60+ rules across shell execution, HTTP exfiltration, obfuscation, and permission abuse
- SHA-256 hash verification — post-install tamper detection
- Continuous monitoring of `~/.openclaw/skills/` with chokidar

### ClawBox — Hardened Deployment

Docker Compose stack with:
- Traefik reverse proxy with TLS termination
- Fail2ban rate limiting
- Non-root container user
- Read-only filesystem where possible
- No outbound network access from the OpenClaw container

### ClawEye — Security Dashboard

Real-time Next.js dashboard at `http://localhost:7432`:
- Live event feed via Server-Sent Events (polls shared SQLite every 2s)
- Correlation engine: detects multi-step attack chains across sessions
- Security score gauge (0–100)
- Module health panel with live liveness checks
- Hourly sparkline of blocked vs total events

---

## CLI Reference

```bash
clawsentinel init                    # Interactive setup wizard
clawsentinel start                   # Start all 5 modules
clawsentinel start --no-eye          # Start without ClawEye dashboard
clawsentinel stop                    # Stop all modules
clawsentinel status                  # Color-coded module health
clawsentinel status --json           # Machine-readable status
clawsentinel logs                    # View audit log (last 50 events)
clawsentinel logs --severity block   # Filter by severity
clawsentinel enable <module>         # Re-enable a disabled module
clawsentinel disable <module>        # Disable a specific module
clawsentinel vault set <key> <val>   # Store a secret in ClawVault
clawsentinel vault get <key>         # Retrieve a secret
clawsentinel scan <skill-id>         # Scan a skill before installing
clawsentinel test --attack-suite     # Run the full T1–T7 attack test suite
clawsentinel test --threat T1        # Run a specific threat model
```

---

## BYOK — Zero Variable Cost

ClawSentinel's semantic engine uses your existing OpenClaw API key — the one you already have. No additional subscriptions. Auto-detected from your OpenClaw config on `init`.

Supported providers (in priority order):
1. **Anthropic Claude Haiku** — fastest, cheapest
2. **OpenAI GPT-4o-mini** — fallback
3. **Google Gemini Flash** — fallback
4. **Ollama** — fully local, no API key needed

The semantic engine is **cost-gated**: it only fires when the pattern engine scores a message above 30. Typical usage: ~100 semantic checks per day.

---

## Non-Breaking by Design

- OpenClaw is **never modified** — ClawSentinel only adds, never changes
- **Passthrough-first** — if any module fails, traffic passes through unmodified
- Every module can be **independently disabled**: `clawsentinel disable clawguard`
- Removing ClawSentinel requires one config change to restore OpenClaw's original state

---

## Attack Test Suite

Run the complete threat model coverage tests:

```bash
clawsentinel test --attack-suite
```

```
ClawSentinel Attack Test Suite
─────────────────────────────────────────────────
 ✓  T1  Prompt Injection          42/42 passed
 ✓  T2  Supply Chain              28/28 passed
 ✓  T3  Indirect Injection        30/30 passed
 ✓  T5  Tool Abuse                38/38 passed
 ✓  T6  Memory Tampering          36/36 passed
 ✓  T7  Credential Theft          42/42 passed
─────────────────────────────────────────────────
    6/6 threat models  ·  216 tests passed
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 20 LTS |
| Proxy | `ws` + `http-proxy-middleware` |
| Database | SQLite (`better-sqlite3`) |
| Secrets | `keytar` (OS keychain) + AES-256-GCM |
| Dashboard | Next.js 14 + Tailwind CSS |
| Containers | Docker Compose v2 |
| Monorepo | npm workspaces + Turborepo |
| Testing | Vitest |

---

## Project Structure

```
clawsentinel/
├── packages/
│   ├── core/               ← Shared types, SQLite schema, event bus, logger, config
│   ├── clawguard/          ← WS + HTTP proxy, pattern engine, semantic engine, taint tracker
│   │   └── src/rules/      ← 500 detection rules (8 JSON files)
│   ├── clawvault/          ← AES-256-GCM encrypted credential vault
│   ├── clawhub-scanner/    ← Static analysis engine + skill install interceptor
│   ├── clawbox/            ← Hardened Docker Compose stack
│   ├── claweye/            ← Next.js 14 real-time dashboard
│   └── extension/          ← Chrome Extension MV3
└── apps/
    └── cli/                ← clawsentinel CLI
tests/
└── attack-suite/           ← T1–T7 threat model test suites
```

---

## Development

```bash
git clone https://github.com/hshdevhub/clawsentinel
cd clawsentinel
npm install
npm run build
```

Run all tests:

```bash
npm test
```

Run only the attack suite:

```bash
npm run test:attack-suite
# or
clawsentinel test --attack-suite
```

---

## Security

See [SECURITY.md](SECURITY.md) for the responsible disclosure policy and vulnerability reporting process.

---

## License

MIT — free to use, modify, and distribute.

---

**Author:** [hshdevhub](https://github.com/hshdevhub)
**Website:** [clawsentinel.sh](https://clawsentinel.sh)
**npm:** [@clawsentinel/cli](https://www.npmjs.com/package/@clawsentinel/cli)
