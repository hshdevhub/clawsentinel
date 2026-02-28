# @clawsentinel/clawvault

Encrypted credential store for the ClawSentinel security platform. Keeps API keys and secrets out of plaintext config files and away from prompt injection attacks.

> This is an internal package. Install [`clawsentinel`](https://www.npmjs.com/package/clawsentinel) to use the full platform.

## Features

- **AES-256-GCM encryption** — all secrets encrypted at rest
- **OS keychain integration** — uses macOS Keychain / Windows Credential Manager / libsecret via `keytar`
- **Vault references** — use `@vault:KEY` in tool calls; ClawGuard resolves them before forwarding
- **Raw key detection** — detects plaintext API keys leaking through outbound requests (T7 threat)
- **Per-endpoint scoping** — credentials bound to specific API endpoints, not global

## Usage (via CLI)

```bash
# Store a credential
clawsentinel vault set ANTHROPIC_API_KEY sk-ant-... --endpoint https://api.anthropic.com

# Retrieve a credential
clawsentinel vault get ANTHROPIC_API_KEY

# List all stored keys
clawsentinel vault list
```

## Threat addressed

**T7 — Credential Theft**: Prompt injection attacks instruct the agent to reveal API keys in its responses. ClawVault keeps keys out of the agent context entirely — they are injected at the proxy layer only when needed.

## Links

- [ClawSentinel Platform](https://clawsentinel.dev)
- [GitHub](https://github.com/hshdevhub/clawsentinel)
- [License: Elastic-2.0](https://www.elastic.co/licensing/elastic-license)
