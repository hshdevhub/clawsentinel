# @clawsentinel/clawhub-scanner

Pre-install skill scanner for the ClawSentinel security platform. Intercepts `openclaw skill install` commands and scans skill YAML source for supply chain threats before anything is installed.

> This is an internal package. Install [`clawsentinel`](https://www.npmjs.com/package/clawsentinel) to use the full platform.

## What it does

ClawHub Scanner hooks into the OpenClaw skill install lifecycle and runs a static analysis pipeline on every skill before it executes:

| Check | What it catches |
|---|---|
| **Shell execution** | `exec()`, `spawn()`, `execSync()`, `child_process` usage |
| **Reverse shell** | `/bin/bash`, `netcat`, `mkfifo`, piped shell patterns |
| **Code evaluation** | `eval()`, `new Function()`, obfuscated dynamic execution |
| **Credential access** | Reads from `~/.ssh`, `~/.aws`, `~/.openclaw/config`, `process.env.*_KEY` |
| **Embedded injection** | Prompt injection payloads hard-coded into skill `systemPrompt` fields |
| **Outbound HTTP** | Calls to non-allowlisted domains (flagged as warn) |
| **SSRF** | Internal/loopback HTTP calls (`127.0.0.1`, `192.168.x.x`, `localhost`) |
| **Persistence** | `crontab`, `launchctl`, `systemctl enable` — skills that survive reboots |
| **Tamper detection** | SHA-256 hash verification — flags skills modified after initial scan |

## Verdict levels

| Score | Verdict | Action |
|---|---|---|
| 0 block findings | ✅ Safe | Install proceeds |
| 1+ warn findings | ⚠️ Review | User prompted to confirm |
| 1+ block findings | 🔴 Blocked | Install halted |

## Usage (via CLI)

```bash
# Scan a skill before installing
clawsentinel scan <skill-id>

# Scan from a local YAML file
clawsentinel scan ./my-skill.yaml
```

## Threat addressed

**T2 — Supply Chain Attack**: A malicious skill published to ClawHub runs with full OpenClaw permissions. ClawHub Scanner catches the attack before the skill ever executes.

## Links

- [ClawSentinel Platform](https://clawsentinel.dev)
- [GitHub](https://github.com/hshdevhub/clawsentinel)
- [License: Elastic-2.0](https://www.elastic.co/licensing/elastic-license)
