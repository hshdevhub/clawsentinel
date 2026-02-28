# ClawSentinel

**The active security layer for OpenClaw — one install, five layers, complete protection.**

ClawSentinel blocks prompt injection, supply chain attacks, and credential theft before they reach your AI agent. It wraps OpenClaw with a defence-in-depth security stack that is completely transparent to your workflow.

```bash
npm install -g clawsentinel
clawsentinel init
clawsentinel start
```

---

## Why ClawSentinel

OpenClaw agents read web content, install skills, and make outbound HTTP calls. Each of these is an attack surface:

- **Prompt injection** — malicious instructions hidden in web pages hijack your agent
- **Supply chain attacks** — a skill with a backdoor runs with full agent permissions
- **Data exfiltration** — agent memory silently written to attacker-controlled URLs
- **Credential theft** — API keys extracted from responses and sent outbound

ClawSentinel intercepts all of this before it reaches OpenClaw.

---

## Five Layers

| Layer | Module | What it does |
|---|---|---|
| 01 | **ClawBox** | Hardened Docker deployment with network isolation |
| 02 | **ClawVault** | AES-256-GCM encrypted credential store + OS keychain |
| 03 | **ClawGuard** | WebSocket + HTTP proxy firewall, 566 pattern rules |
| 04 | **ClawHub Scanner** | Pre-install skill scanner, supply chain protection |
| 05 | **ClawEye** | Real-time dashboard, correlation engine, live alerts |

---

## Quick Start

```bash
# Install
npm install -g clawsentinel

# First-time setup (interactive wizard)
clawsentinel init

# Start all layers
clawsentinel start

# Check status
clawsentinel status

# Open dashboard
clawsentinel dashboard
```

ClawSentinel auto-detects your OpenClaw config. No changes to your existing OpenClaw setup required.

---

## CLI Reference

```bash
clawsentinel start              # Start all security layers
clawsentinel stop               # Stop all layers
clawsentinel status             # Show layer health
clawsentinel scan <skill-id>    # Scan a ClawHub skill before installing
clawsentinel scan "text"        # Scan arbitrary text for injection patterns
clawsentinel vault set KEY val  # Store a credential in ClawVault
clawsentinel vault get KEY      # Retrieve a credential
clawsentinel config list        # Show current configuration
clawsentinel billing status     # Show plan and subscription status
clawsentinel monitor            # Live event monitor (tail mode)
```

---

## Plans

| | Free | Pro |
|---|---|---|
| Pattern engine (566 rules) | ✅ | ✅ |
| WS + HTTP proxy firewall | ✅ | ✅ |
| ClawHub supply chain scanner | ✅ | ✅ |
| ClawVault credential store | ✅ | ✅ |
| Real-time event feed | ✅ | ✅ |
| Semantic LLM engine | ❌ | ✅ |
| Correlation engine (7 rules) | ❌ | ✅ |
| **Price** | **Free** | **$9/mo** |

[Upgrade to Pro →](https://clawsentinel.dev/#pricing)

---

## Chrome Extension

The **ClawSentinel Guard** browser extension detects prompt injection on any webpage before you share it with your AI agent.

- Scans every page automatically
- Right-click any text → "Scan with ClawSentinel"
- Highlights injection threats directly on the page
- Blocks dangerous ClawHub skill installs

[Install from Chrome Web Store →](https://clawsentinel.dev)

---

## Requirements

- Node.js 20+
- OpenClaw installed and configured
- macOS, Linux, or Windows (WSL2)

---

## License

[Elastic License 2.0](https://www.elastic.co/licensing/elastic-license) — free to use, self-host, and audit. Commercial redistribution requires a separate agreement.

## Links

- [Website](https://clawsentinel.dev)
- [GitHub](https://github.com/hshdevhub/clawsentinel)
- [Issues](https://github.com/hshdevhub/clawsentinel/issues)
- [Security](https://github.com/hshdevhub/clawsentinel/blob/main/SECURITY.md)
