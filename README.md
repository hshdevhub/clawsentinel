# ClawSentinel

**The active security layer for OpenClaw. One install. Five layers. Complete protection.**

> OpenClaw is a powerful local AI agent — but it was built for capability, not security. ClawSentinel is the security platform it was never shipped with.

---

## Why ClawSentinel

OpenClaw gained 8 CVEs within 3 weeks of going viral — including a critical RCE, supply-chain poisoning, and prompt injection attacks. Every existing security tool for OpenClaw has the same fundamental flaw: their rules live **inside** the agent context window, meaning a single injection can disable them entirely.

ClawSentinel runs **outside** the agent at the Node.js process level. No prompt injection can reach it. No injected instruction can turn it off.

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
│                AES-256 + OS keychain             │
├─────────────────────────────────────────────────┤
│  ClawGuard     WebSocket + HTTP proxy            │
│                Prompt injection firewall         │
│                1,247 pattern signatures          │
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

## Quick Start

```bash
# One command install
curl -fsSL https://get.clawsentinel.sh | bash

# Or via npm
npm install -g clawsentinel
clawsentinel init
```

ClawSentinel auto-detects your existing OpenClaw installation and API keys. Zero manual configuration required.

---

## How It Works

ClawSentinel wraps OpenClaw as a **transparent proxy** — OpenClaw stays untouched on `:18789`, ClawSentinel listens on `:18790`. All clients point to `:18790`. If ClawSentinel is ever removed, one config line restores OpenClaw to its original state.

```bash
# Before ClawSentinel — clients connect to:
ws://127.0.0.1:18789

# After ClawSentinel — clients connect to:
ws://127.0.0.1:18790   ← ClawSentinel proxy (forwards to :18789)
```

---

## Non-Breaking by Design

- OpenClaw is **never modified** — ClawSentinel only adds, never changes
- **Passthrough-first** — if any module fails, traffic passes through unmodified
- Every module can be **independently disabled**: `clawsentinel disable clawguard`
- Full **uninstall** restores original state completely

---

## BYOK — Zero Variable Cost

ClawSentinel's semantic engine uses your existing OpenClaw API key — the one you already have. No additional subscriptions. Auto-detected from your OpenClaw config on init.

Supported: Anthropic Claude · OpenAI GPT · Google Gemini · Ollama (local)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 20 LTS |
| Proxy | `ws` + `http-proxy-middleware` |
| Database | SQLite (`better-sqlite3`) |
| Secrets | `keytar` (OS keychain) + AES-256-GCM |
| Dashboard | Next.js 14 + Tailwind CSS |
| Containers | Docker Compose v2 |
| Monorepo | npm workspaces + Turborepo |

---

## Project Structure

```
clawsentinel/
├── packages/
│   ├── core/               ← Shared types, event bus, SQLite schema
│   ├── clawguard/          ← WebSocket + HTTP proxy, pattern engine
│   ├── clawvault/          ← Encrypted credential vault
│   ├── clawhub-scanner/    ← Skill scanner + install interceptor
│   ├── clawbox/            ← Docker Compose hardened stack
│   └── claweye/            ← Next.js dashboard
└── apps/
    └── cli/                ← clawsentinel CLI
```

---

## CLI Commands

```bash
clawsentinel init          # Setup and auto-detect OpenClaw config
clawsentinel start         # Start all modules
clawsentinel stop          # Stop all modules
clawsentinel status        # Show health of all 5 modules
clawsentinel logs          # View audit log
clawsentinel disable <mod> # Disable a specific module
clawsentinel enable <mod>  # Re-enable a module
clawsentinel uninstall     # Full removal, restores original state
```

---

## Threat Coverage

| Threat | Description | Module |
|---|---|---|
| T1 | Indirect prompt injection | ClawGuard |
| T2 | Supply chain / skill poisoning | ClawHub Scanner |
| T3 | Open DM policy abuse | ClawBox |
| T4 | Canvas XSS | ClawBox |
| T5 | Tool abuse (shell, filesystem) | ClawGuard |
| T6 | Persistent memory tampering | ClawGuard + ClawEye |
| T7 | API key exfiltration | ClawVault |

---

## Development

```bash
git clone https://github.com/hshdevhub/clawsentinel
cd clawsentinel
npm install
npm run build
npm run dev
```

Run the attack test suite:

```bash
npm run test:attack-suite
```

---

## License

MIT — free to use, modify, and distribute.

---

**Author:** [hshdevhub](https://github.com/hshdevhub)
**Website:** clawsentinel.sh
