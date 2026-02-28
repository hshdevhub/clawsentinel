# @clawsentinel/clawguard

WebSocket and HTTP proxy firewall for the ClawSentinel security platform. Sits between your AI agent and OpenClaw, inspecting every message in real time.

> This is an internal package. Install [`clawsentinel`](https://www.npmjs.com/package/clawsentinel) to use the full platform.

## What it does

ClawGuard intercepts all traffic on ports `:18790` (WebSocket) and `:18791` (HTTP) and applies seven security checks before forwarding to OpenClaw on `:18789`:

| Check | What it blocks |
|---|---|
| **Pattern engine** | 566 regex rules across 8 categories — prompt injection, exfiltration, memory tampering, tool abuse, encoding attacks, multilingual injection, social engineering, context manipulation |
| **Tool name blocklist** | Blocks calls to dangerous tools (shell execution, filesystem writes to sensitive paths) |
| **Shell command blocklist** | Blocks `rm -rf`, `curl \| bash`, reverse shell patterns in tool inputs |
| **Filesystem path blocklist** | Blocks access to `~/.ssh`, `~/.aws`, `~/.openclaw/config` and other sensitive paths |
| **Domain allowlist** | Warns or blocks outbound HTTP to non-allowlisted domains |
| **Raw API key detection** | Detects plaintext API keys leaking through outbound payloads (T7 threat) |
| **ClawVault injection** | Resolves `@vault:KEY` references before forwarding — keys never touch the agent context |

## HTTP API (local only)

```
GET  /health              → service health + rule count
GET  /api/rules           → all 566 pattern rules (used by Chrome extension)
POST /api/scan            → scan arbitrary text, returns score + verdict
```

## Passthrough-first

If ClawGuard fails or crashes, traffic is never silently dropped — the proxy fails open so OpenClaw continues working. Security is layered, not a single point of failure.

## Threats addressed

- **T1** Prompt Injection — pattern engine blocks hidden instructions in web content
- **T3/T6** Data Exfiltration — domain allowlist + exfil pattern rules
- **T4** Tool Abuse — tool name + shell command + filesystem blocklists
- **T7** Credential Theft — raw key detection + ClawVault injection

## Links

- [ClawSentinel Platform](https://clawsentinel.dev)
- [GitHub](https://github.com/hshdevhub/clawsentinel)
- [License: Elastic-2.0](https://www.elastic.co/licensing/elastic-license)
