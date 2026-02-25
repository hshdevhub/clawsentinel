# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.6.x (latest) | ✅ Active |
| 0.5.x | ✅ Security patches only |
| < 0.5.0 | ❌ End of life |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately via one of:

- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/hshdevhub/clawsentinel/security/advisories/new) ← preferred
- **Email**: security@clawsentinel.sh

### What to include

- Description of the vulnerability and its impact
- Steps to reproduce (proof of concept if possible)
- Affected version(s)
- Suggested fix (optional but appreciated)

### Response timeline

| Event | Target |
|-------|--------|
| Initial acknowledgement | 48 hours |
| Severity assessment | 5 business days |
| Fix for Critical/High | 14 days |
| Fix for Medium/Low | 30 days |
| Public disclosure | After fix is released |

We follow coordinated disclosure. If you report a valid vulnerability, we will credit you in the release notes unless you prefer to remain anonymous.

---

## Scope

### In scope

- **ClawGuard** — WebSocket/HTTP proxy, pattern engine, semantic engine
- **ClawVault** — credential encryption, OS keychain integration
- **ClawHub Scanner** — static analysis engine, supply chain scanner
- **ClawEye** — dashboard API routes, SSE stream, correlation engine
- **ClawBox** — Docker configuration, Traefik config
- **CLI** — `clawsentinel` command-line tool
- **Chrome Extension** — content scripts, service worker, popup

### Out of scope

- Vulnerabilities in upstream dependencies (report to the respective maintainer)
- Denial-of-service attacks requiring physical access
- Social engineering of maintainers
- Issues in demo/example code that is clearly labelled as insecure

---

## Security Architecture

ClawSentinel is designed with a **defence-in-depth** model. Each module is independent — a compromise of one does not automatically compromise others.

### Key design decisions

**Process isolation**: ClawGuard runs as a separate Node.js process from OpenClaw. No prompt injection can reach the security rules because they live outside the agent's context window.

**Passthrough-first**: If any module fails or throws an error, traffic is forwarded to OpenClaw unmodified. ClawSentinel never silently drops messages.

**Encrypted storage**: ClawVault encrypts all credentials with AES-256-GCM. The master key is derived using PBKDF2 and stored in the OS keychain (macOS Keychain / Linux Secret Service / Windows Credential Manager). Credentials are never written to disk in plaintext.

**No telemetry**: ClawSentinel does not phone home, collect usage data, or send any information to external servers. All detection runs locally.

**BYOK**: The semantic engine uses the user's own API key (auto-detected from OpenClaw config). ClawSentinel never has access to an Anthropic/OpenAI key it didn't read from the user's own system.

---

## Known Attack Vectors Covered

| ID | Threat | Module |
|----|--------|--------|
| T1 | Indirect prompt injection | ClawGuard |
| T2 | Supply chain / skill poisoning | ClawHub Scanner |
| T3 | Indirect context injection (emails, docs, APIs) | ClawGuard |
| T4 | Canvas XSS | ClawBox |
| T5 | Tool abuse (shell, filesystem, HTTP, MCP) | ClawGuard |
| T6 | Persistent memory tampering | ClawGuard + ClawEye |
| T7 | API key / credential exfiltration | ClawVault + ClawGuard |

The attack test suite (`clawsentinel test --attack-suite`) covers all 7 threat models with 100+ known malicious payloads and safe-phrase false-positive checks.

---

## Dependency Security

All dependencies are pinned to semver ranges. We run `npm audit` in CI on every commit. If you discover a vulnerability in a dependency we use, please report it to the dependency maintainer first, then notify us so we can schedule an upgrade.

---

*This security policy was last updated: 2026-02-25*
