# ClawSentinel

> The active security layer for OpenClaw. One install. Five layers. Complete protection.

## What is ClawSentinel?

ClawSentinel is a unified 5-layer security platform for [OpenClaw](https://openclaw.ai) — a local AI agent. It wraps OpenClaw with a transparent security layer that cannot be bypassed by prompt injection.

## Modules

| Module | Role |
|---|---|
| **ClawBox** | Hardened Docker deployment |
| **ClawVault** | Encrypted credential store (AES-256 + OS keychain) |
| **ClawGuard** | WebSocket proxy — prompt injection firewall |
| **ClawHub Scanner** | Pre-install skill scanner (supply chain protection) |
| **ClawEye** | Real-time security dashboard + correlation engine |

## Quick Start

```bash
curl -fsSL https://get.clawsentinel.sh | bash
```

Or via npm:

```bash
npm install -g clawsentinel
clawsentinel init
```

## Architecture

ClawSentinel wraps OpenClaw transparently — OpenClaw stays on `:18789`, ClawSentinel listens on `:18790`. All clients point to `:18790`. Non-breaking by design.

## Development

```bash
npm install
npm run build
npm run dev
```

## Docs

See `/docs` folder for full product plan, architecture, and technical spec.

---

**Website:** clawsentinel.sh
