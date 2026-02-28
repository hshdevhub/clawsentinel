# @clawsentinel/core

Shared kernel for the ClawSentinel security platform — event bus, configuration loader, structured logger, and module utilities used by all ClawSentinel packages.

> This is an internal package. Install [`clawsentinel`](https://www.npmjs.com/package/clawsentinel) to use the full platform.

## What's inside

- **EventBus** — typed pub/sub bus for inter-module communication (ClawGuard → ClawEye alerts)
- **Config loader** — reads and validates `~/.clawsentinel/config.json`, exposes typed settings
- **Module logger** — structured JSON logger with per-module namespacing
- **Type definitions** — shared TypeScript interfaces (`ScanResult`, `ThreatEvent`, `PlanInfo`, etc.)

## Used by

| Package | Purpose |
|---|---|
| `@clawsentinel/clawguard` | Event emission, config (block threshold, plan) |
| `@clawsentinel/clawvault` | Config (vault path, keychain preference) |
| `@clawsentinel/clawhub-scanner` | Event emission, logger |
| `clawsentinel` (CLI) | Config read/write, logger |

## Links

- [ClawSentinel Platform](https://clawsentinel.dev)
- [GitHub](https://github.com/hshdevhub/clawsentinel)
- [License: Elastic-2.0](https://www.elastic.co/licensing/elastic-license)
