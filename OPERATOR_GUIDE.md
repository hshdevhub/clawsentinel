# ClawSentinel — Operator Guide
### Complete Command Reference + Deployment Playbook
**Version:** 0.6.1 | **Last updated:** February 2026

---

## Table of Contents

1. [What you need to manage](#1-what-you-need-to-manage)
2. [Directory layout on disk](#2-directory-layout-on-disk)
3. [Full command reference](#3-full-command-reference)
4. [Configuration reference](#4-configuration-reference)
5. [Deployment — Option A: Local install](#5-deployment--option-a-local-install)
6. [Deployment — Option B: systemd daemon (Linux)](#6-deployment--option-b-systemd-daemon-linux)
7. [Deployment — Option C: ClawBox Docker](#7-deployment--option-c-clawbox-docker)
8. [Deployment — Option D: From source (dev)](#8-deployment--option-d-from-source-dev)
9. [Backup and restore](#9-backup-and-restore)
10. [Upgrading](#10-upgrading)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What you need to manage

**Short answer: very little.** ClawSentinel is designed to run without manual intervention after the first setup. Here is exactly what exists on your machine and who owns it:

| Item | Path | You manage? | Notes |
|------|------|-------------|-------|
| Config file | `~/.clawsentinel/config.json` | Optional | Auto-created on `init`. Edit via `config set` commands or directly. |
| SQLite database | `~/.clawsentinel/clawsentinel.db` | No — auto-managed | All events, skill scans, module health, and hashes. Grows over time. |
| PID files | `~/.clawsentinel/run/*.pid` | No — auto-managed | Written on start, deleted on stop. Never touch these manually. |
| Vault keyfile | `~/.clawsentinel/vault.key` | No — auto-managed | Master key protected by OS keychain. Do not copy or move without `vault export`. |
| Environment variables | Shell / `.env` files | Yes | API keys for semantic engine. See section 4. |
| OpenClaw config | Wherever OpenClaw stores it | Yes — one-time change | Must point to `:18790` instead of `:18789`. |

**The only thing you must do after deploying is:**
1. Run `clawsentinel init` once.
2. Change OpenClaw's WebSocket URL from `ws://127.0.0.1:18789` to `ws://127.0.0.1:18790`.
3. Run `clawsentinel start`.

That's it. Everything else is automatic.

---

## 2. Directory layout on disk

```
~/.clawsentinel/
├── config.json          ← your settings (edit with: clawsentinel config set ...)
├── clawsentinel.db      ← SQLite database (do not delete unless uninstalling)
├── clawsentinel.db-wal  ← SQLite WAL file (auto-managed, safe to ignore)
├── clawsentinel.db-shm  ← SQLite shared memory (auto-managed, safe to ignore)
├── vault.key            ← ClawVault master key (DO NOT DELETE — loses all vault credentials)
└── run/
    ├── clawguard.pid    ← PID of running ClawGuard process (auto-managed)
    └── claweye.pid      ← PID of running ClawEye process (auto-managed)
```

**Database size:** Events are appended continuously. On a busy system, expect ~1–5 MB/day. No automatic pruning exists yet (planned for Sprint 8). If the DB grows large, you can safely delete it while ClawSentinel is stopped — all security settings are in `config.json`, not the DB.

---

## 3. Full command reference

### Global flags
```
clawsentinel --version       Print version (currently 0.6.1)
clawsentinel --help          Show all commands
clawsentinel <command> --help Show help for a specific command
```

---

### `init` — First-run setup wizard

```
clawsentinel init
```

**What it does:**
- Creates `~/.clawsentinel/` directory
- Initializes the SQLite database with the full schema
- Writes `config.json` with safe defaults
- Prints a summary of what was set up

**When to run:** Once, on first install. Safe to re-run — it skips steps that already exist.

---

### `start` — Start modules

```
clawsentinel start                  Start all modules (ClawGuard + ClawEye)
clawsentinel start --no-eye         Start ClawGuard only (skip ClawEye dashboard)
clawsentinel start -m clawguard     Start ClawGuard only
clawsentinel start -m claweye       Start ClawEye only
```

**What starts:**
- **ClawGuard** — WS proxy (`:18790` → `:18789`) + HTTP proxy (`:18791`) + ClawHub Scanner watcher (all in one process)
- **ClawEye** — Next.js dashboard at `http://localhost:7432`
- **ClawVault** — Runs inside ClawGuard process (no separate process)
- **ClawHub Scanner** — Runs inside ClawGuard process, watches `~/.openclaw/skills/`

**Process model:** ClawGuard and ClawEye are child processes of the CLI. The CLI parent process must stay alive (use `tmux`, `screen`, or systemd — see deployment sections). PIDs are written to `~/.clawsentinel/run/`.

**Environment variables read at startup:**
```bash
LISTEN_PORT=18790         # ClawGuard WS proxy port
UPSTREAM_WS=ws://127.0.0.1:18789   # OpenClaw upstream
CLAWEYE_PORT=7432         # ClawEye dashboard port
OPENCLAW_SKILLS_DIR=~/.openclaw/skills
ANTHROPIC_API_KEY=sk-ant-...        # For semantic engine
OPENAI_API_KEY=sk-...               # Fallback semantic engine
```

---

### `stop` — Stop modules

```
clawsentinel stop                   Stop all running modules (SIGTERM)
clawsentinel stop --force           Force-kill all modules (SIGKILL)
clawsentinel stop -m clawguard      Stop ClawGuard only
clawsentinel stop -m claweye        Stop ClawEye only
```

**How it works:** Reads PID from `~/.clawsentinel/run/<name>.pid`, sends signal, cleans up PID file, marks status as `stopped` in DB.

**If a module won't stop:** Use `--force` (SIGKILL). This is safe — ClawSentinel has no in-flight writes that would corrupt data.

---

### `status` — Module health

```
clawsentinel status
```

**Output example:**
```
  ClawSentinel v0.6.1 — Status

  ●  clawguard     running   port :18790   uptime 2h 14m   [Free]
  ●  claweye        running   port :7432    uptime 2h 14m
  ○  clawhub-scanner  (runs inside clawguard)
  ○  clawvault        (runs inside clawguard)

  Dashboard: http://localhost:7432
```

Color codes: `●` green = running, `●` red = error, `○` yellow = stopped, `○` grey = disabled.

---

### `logs` — View audit log

```
clawsentinel logs                         Last 50 events
clawsentinel logs -n 200                  Last 200 events
clawsentinel logs -f                      Follow in real-time (polls every 2s)
clawsentinel logs --severity block        Only blocked events
clawsentinel logs --severity critical     Only critical events
clawsentinel logs --severity warn         Only warnings
clawsentinel logs --severity info         Only info events
clawsentinel logs --source clawguard      Only ClawGuard events
clawsentinel logs --source clawhub        Only ClawHub Scanner events
clawsentinel logs --source clawvault      Only ClawVault events
clawsentinel logs --source system         Only system events
clawsentinel logs --severity block -f     Follow blocks only (real-time monitoring)
```

**Severity levels** (lowest → highest): `info` → `warn` → `block` → `critical`

---

### `scan` — Scan a skill before installing

```
clawsentinel scan <skill-id>              Fetch skill from ClawHub and scan it
clawsentinel scan ./path/to/skill.js      Scan a local file
clawsentinel scan <skill-id> --json       Output full JSON result (for scripting)
clawsentinel scan <skill-id> --force      Install even if verdict is warn (not block)
```

**Exit codes:**
- `0` — safe (verdict: safe)
- `1` — warnings but allowed (verdict: warn, no --force)
- `2` — blocked (verdict: block) — do not install

**Use in CI/CD:**
```bash
clawsentinel scan my-skill --json
if [ $? -eq 2 ]; then echo "BLOCKED — aborting install"; exit 1; fi
```

**Scan categories checked:**
- Shell command injection
- Unauthorized HTTP exfiltration
- Obfuscation / code hiding
- Excessive permission requests
- Known-malicious patterns

---

### `vault` — Encrypted credential store

```
clawsentinel vault list                   List all stored credential names (never shows values)
clawsentinel vault set <name> <value>     Store a credential
clawsentinel vault set <name> <value> --endpoint https://api.example.com   (custom endpoint)
clawsentinel vault delete <name>         Delete a credential
```

**Built-in endpoint defaults** (no --endpoint needed for these names):
| Name | Auto-allowed endpoint |
|------|----------------------|
| `anthropic` | `https://api.anthropic.com` |
| `openai` | `https://api.openai.com` |
| `gemini` | `https://generativelanguage.googleapis.com` |
| `google` | `https://generativelanguage.googleapis.com` |

**Custom names require `--endpoint`:**
```bash
clawsentinel vault set my-db-key "secret" --endpoint https://my-api.example.com
```

**How it works:** Values are encrypted with AES-256-GCM. The master key is stored in the OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager). ClawVault injects credentials at request time — never in config files, never in logs.

**Reference format:** Use `@vault:name` anywhere OpenClaw accepts an API key. ClawVault intercepts and resolves it.

---

### `config` — Manage settings

```
clawsentinel config list                              Show all settings with descriptions
clawsentinel config get <key>                        Get a single value
clawsentinel config set <key> <value>                Set a value
clawsentinel config reset                            Reset all settings to defaults
clawsentinel config reset --yes                      Reset without confirmation prompt
```

**All available keys:**

| Key | Default | Values | Description |
|-----|---------|--------|-------------|
| `clawguard.mode` | `enforce` | `enforce` / `monitor` | enforce = block attacks; monitor = alert only, never block |
| `clawguard.blockThreshold` | `71` | `0–100` | Risk score that triggers a block |
| `clawguard.warnThreshold` | `31` | `0–100` | Risk score that triggers a warning |
| `semanticEngine.enabled` | `true` | `true` / `false` | Enable LLM-assisted semantic analysis |
| `semanticEngine.scoreThreshold` | `30` | `0–100` | Min pattern score before calling LLM |
| `semanticEngine.ollama.enabled` | `false` | `true` / `false` | Use local Ollama instead of cloud LLM |
| `semanticEngine.ollama.model` | `mistral` | any string | Ollama model name |
| `claweye.port` | `7432` | port number | ClawEye dashboard port |
| `modules.clawguard` | `true` | `true` / `false` | Enable ClawGuard |
| `modules.clawhubScanner` | `true` | `true` / `false` | Enable ClawHub Scanner |
| `modules.claweye` | `true` | `true` / `false` | Enable ClawEye dashboard |
| `alerts.desktop` | `true` | `true` / `false` | Desktop OS notifications |
| `alerts.telegram.enabled` | `false` | `true` / `false` | Telegram bot alerts |
| `alerts.telegram.token` | — | string | Telegram bot token |
| `alerts.telegram.chatId` | — | string | Telegram chat/channel ID |

**Examples:**
```bash
# Switch to monitor-only mode (observe without blocking)
clawsentinel config set clawguard.mode monitor

# Lower the block threshold (more aggressive blocking)
clawsentinel config set clawguard.blockThreshold 60

# Disable semantic engine (faster, no API calls)
clawsentinel config set semanticEngine.enabled false

# Use local Ollama instead of cloud
clawsentinel config set semanticEngine.ollama.enabled true
clawsentinel config set semanticEngine.ollama.model llama3

# Enable Telegram alerts
clawsentinel config set alerts.telegram.enabled true
clawsentinel config set alerts.telegram.token "1234567:AABotToken"
clawsentinel config set alerts.telegram.chatId "@mychannel"
```

**After changing `clawguard` settings, restart to apply:**
```bash
clawsentinel stop -m clawguard && clawsentinel start -m clawguard
```

---

### `enable` / `disable` — Toggle modules

```
clawsentinel enable clawguard
clawsentinel enable clawhub-scanner
clawsentinel enable clawvault
clawsentinel enable clawbox
clawsentinel enable claweye

clawsentinel disable clawguard
clawsentinel disable clawhub-scanner
```

These write to `config.json`. Restart to apply. Equivalent to `config set modules.<name> true/false`.

---

### `test` — Run the attack test suite

```
clawsentinel test --attack-suite          Run all 6 threat model tests
clawsentinel test --attack-suite --json   JSON output (for CI)
clawsentinel test -t T1                   Run only T1 (prompt injection)
clawsentinel test -t T2                   Run only T2 (supply chain)
clawsentinel test -t T3                   Run only T3 (open DM / indirect injection)
clawsentinel test -t T5                   Run only T5 (tool abuse)
clawsentinel test -t T6                   Run only T6 (memory tampering)
clawsentinel test -t T7                   Run only T7 (credential theft)
```

**What this tests:** Fires simulated attack payloads against ClawGuard's pattern engine and verifies each one is blocked. Requires the source repo (tests live in `tests/attack-suite/`). Does not require ClawGuard to be running.

**Expected output:**
```
  ClawSentinel Attack Suite

  T1  Prompt Injection     ✓ 8/8 passed
  T2  Supply Chain         ✓ 6/6 passed
  T3  Open DM / Indirect   ✓ 5/5 passed
  T5  Tool Abuse           ✓ 7/7 passed
  T6  Memory Tampering     ✓ 6/6 passed
  T7  Credential Theft     ✓ 5/5 passed

  37/37 passed — all threat models covered
```

---

### `uninstall` — Remove ClawSentinel data

```
clawsentinel uninstall                    Interactive: stops all modules, removes ~/.clawsentinel
clawsentinel uninstall --yes             Skip confirmation
clawsentinel uninstall --keep-db         Preserve the event database (logs + scan results)
```

**After uninstalling, remove the npm package:**
```bash
npm uninstall -g clawsentinel
```

**What is removed:**
- All running ClawGuard and ClawEye processes (SIGTERM)
- `~/.clawsentinel/clawsentinel.db` (unless --keep-db)
- `~/.clawsentinel/config.json`
- `~/.clawsentinel/vault.key` — **this permanently deletes all vault credentials**
- `~/.clawsentinel/run/` PID directory

---

## 4. Configuration reference

### The config file

Location: `~/.clawsentinel/config.json`

Full default config (auto-generated by `clawsentinel init`):
```json
{
  "version": "0.1.0",
  "proxy": {
    "listenPort": 18790,
    "upstreamPort": 18789,
    "upstreamHost": "127.0.0.1"
  },
  "modules": {
    "clawguard": true,
    "clawvault": true,
    "clawhubScanner": true,
    "clawbox": false,
    "claweye": true
  },
  "semanticEngine": {
    "enabled": true,
    "scoreThreshold": 30,
    "ollama": {
      "enabled": false,
      "host": "http://localhost:11434",
      "model": "mistral"
    }
  },
  "clawguard": {
    "mode": "enforce",
    "blockThreshold": 71,
    "warnThreshold": 31,
    "maxLatencyMs": 50
  },
  "clawhubScanner": {
    "passThreshold": 60,
    "blockOnFailure": true,
    "allowUnverified": false
  },
  "claweye": {
    "port": 7432,
    "correlationWindowMs": 1800000
  },
  "alerts": {
    "desktop": true,
    "telegram": {
      "enabled": false
    }
  }
}
```

### Environment variables

These take precedence over `config.json`. Set in your shell `~/.zshrc` / `~/.bashrc` or in `packages/clawguard/.env`:

```bash
# Ports and routing
LISTEN_PORT=18790
UPSTREAM_WS=ws://127.0.0.1:18789
UPSTREAM_HTTP=http://127.0.0.1:18789
CLAWEYE_PORT=7432

# Paths
CLAWSENTINEL_DB=~/.clawsentinel/clawsentinel.db
OPENCLAW_SKILLS_DIR=~/.openclaw/skills

# Logging
LOG_LEVEL=info           # debug | info | warn | error

# Semantic engine API keys (BYOK — bring your own key)
# Priority: Anthropic → OpenAI → Ollama → pattern-only fallback
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## 5. Deployment — Option A: Local install

This is the recommended option for personal machines and developers.

### Step 1 — Install the npm package
```bash
npm install -g clawsentinel
```

### Step 2 — Initialize
```bash
clawsentinel init
```

### Step 3 — (Optional) Add API keys for semantic engine
```bash
# Option A: environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Option B: store in ClawVault (more secure)
clawsentinel vault set anthropic sk-ant-...
```

### Step 4 — (Optional) Configure mode
```bash
# If you want alerts-only without blocking (safe for testing):
clawsentinel config set clawguard.mode monitor

# Default is enforce (recommended for production):
# clawsentinel config set clawguard.mode enforce
```

### Step 5 — Start
```bash
clawsentinel start
```

### Step 6 — Update OpenClaw connection

Find where OpenClaw is configured to connect and change the WebSocket URL:

```
Before:  ws://127.0.0.1:18789
After:   ws://127.0.0.1:18790
```

This is typically in OpenClaw's `settings.json` or environment config. ClawGuard listens on `:18790` and forwards clean traffic to the real OpenClaw on `:18789` — OpenClaw continues running exactly as before.

### Step 7 — Open the dashboard
```
http://localhost:7432
```

### Keeping it alive

The CLI process must stay alive for ClawGuard and ClawEye to keep running. Use one of:

```bash
# tmux (recommended for developers)
tmux new-session -d -s clawsentinel 'clawsentinel start'

# screen
screen -dmS clawsentinel clawsentinel start

# nohup (simplest)
nohup clawsentinel start &
```

For permanent background operation, use the systemd option (see next section).

---

## 6. Deployment — Option B: systemd daemon (Linux)

For Linux servers or anywhere you want ClawSentinel to start automatically on boot.

### Step 1 — Install globally
```bash
sudo npm install -g clawsentinel
clawsentinel init
```

### Step 2 — Create the systemd unit file

```bash
sudo nano /etc/systemd/system/clawsentinel.service
```

Paste (replace `youruser` with your actual username):

```ini
[Unit]
Description=ClawSentinel — Active security layer for OpenClaw
Documentation=https://github.com/hshdevhub/clawsentinel
After=network.target
Wants=network.target

[Service]
Type=simple
User=youruser
Group=youruser
WorkingDirectory=/home/youruser

# Environment
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info
# Add your API key here or use EnvironmentFile
# Environment=ANTHROPIC_API_KEY=sk-ant-...
# Or use an env file:
# EnvironmentFile=/home/youruser/.clawsentinel/.env

ExecStart=/usr/local/bin/clawsentinel start --no-eye
ExecStop=/usr/local/bin/clawsentinel stop
ExecReload=/usr/local/bin/clawsentinel stop && /usr/local/bin/clawsentinel start --no-eye

# Restart policy
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=3

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

**Note:** `--no-eye` skips ClawEye in the main service. Run ClawEye as a separate unit if desired:

```ini
# /etc/systemd/system/claweye.service
[Unit]
Description=ClawEye — ClawSentinel Dashboard
After=clawsentinel.service
Requires=clawsentinel.service

[Service]
Type=simple
User=youruser
ExecStart=/usr/local/bin/clawsentinel start -m claweye
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Step 3 — Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable clawsentinel
sudo systemctl start clawsentinel
sudo systemctl status clawsentinel
```

### Step 4 — Check logs via journalctl
```bash
journalctl -u clawsentinel -f          # follow
journalctl -u clawsentinel --since today
journalctl -u clawsentinel -n 100      # last 100 lines
```

Also available via ClawSentinel's own log command:
```bash
clawsentinel logs -f
```

### Step 5 — Store API key securely (optional)

Create an env file owned only by the service user:
```bash
sudo -u youruser nano /home/youruser/.clawsentinel/.env
```
Contents:
```bash
ANTHROPIC_API_KEY=sk-ant-...
LOG_LEVEL=info
```
```bash
chmod 600 /home/youruser/.clawsentinel/.env
```

Then reference it in the unit file with `EnvironmentFile=`.

---

## 7. Deployment — Option C: ClawBox Docker

ClawBox provides a production-hardened Docker environment with TLS, rate limiting, and fail2ban.

### What ClawBox includes
- **Traefik** reverse proxy with automatic TLS (`packages/clawbox/traefik/traefik.yml`)
- **fail2ban** that bans IPs with repeated blocked requests (`packages/clawbox/fail2ban/jail.conf`)
- **Hardened OpenClaw config** with restricted tool access and disabled dangerous commands
- ClawGuard and ClawEye running inside the container

### Step 1 — Prerequisites
```bash
# Docker + Docker Compose
docker --version      # 24.x+
docker compose version  # 2.x+
```

### Step 2 — Clone and set up
```bash
git clone https://github.com/hshdevhub/clawsentinel
cd clawsentinel/packages/clawbox
```

### Step 3 — Run setup script
```bash
./setup.sh
```

The setup script:
1. Builds the Docker image
2. Generates TLS certificates (self-signed for dev, or uses your existing certs)
3. Configures fail2ban filters
4. Creates the Docker network
5. Writes a `.env` file in `packages/clawbox/`

### Step 4 — Add your API key
```bash
# Edit the .env file created by setup.sh
nano .env
```
Add:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Step 5 — Start
```bash
docker compose up -d
```

### Step 6 — Verify
```bash
docker compose ps
docker compose logs clawguard -f
```

Dashboard is at `https://localhost:7432` (TLS).

### Step 7 — Update OpenClaw

Point OpenClaw to the container's ClawGuard port:
```
ws://localhost:18790
```

### Docker Compose reference

```bash
docker compose up -d              # Start all containers
docker compose down               # Stop all containers
docker compose restart clawguard  # Restart ClawGuard only
docker compose logs -f            # Follow all logs
docker compose logs clawguard -f  # Follow ClawGuard logs
docker compose pull && docker compose up -d  # Update to latest
```

### Data persistence in Docker

The Docker Compose mounts two volumes:
```yaml
volumes:
  - clawsentinel-db:/data     # SQLite database
  - clawsentinel-cfg:/config  # config.json, vault.key
```

These volumes persist across container restarts. To back them up:
```bash
docker run --rm -v clawsentinel-db:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/clawsentinel-db.tar.gz /data
```

---

## 8. Deployment — Option D: From source (dev)

For contributors or anyone who wants to modify ClawSentinel.

### Prerequisites
```bash
node --version   # 18+
npm --version    # 9+
```

### Step 1 — Clone
```bash
git clone https://github.com/hshdevhub/clawsentinel
cd clawsentinel
```

### Step 2 — Install dependencies
```bash
npm install
```
This installs all workspace packages via npm workspaces.

### Step 3 — Build all packages
```bash
npm run build
```
Or with Turborepo (faster, uses cache):
```bash
npx turbo build
```
Build outputs go to `packages/*/dist/` and `apps/cli/dist/`.

### Step 4 — Initialize and start
```bash
node apps/cli/dist/index.js init
node apps/cli/dist/index.js start
```

Or link the CLI globally during development:
```bash
npm link --workspace=apps/cli
clawsentinel init
clawsentinel start
```

### Step 5 — Rebuild after changes
```bash
# Rebuild only changed packages (Turborepo cache-aware)
npx turbo build --filter=clawguard
npx turbo build --filter=claweye

# Rebuild everything
npm run build
```

### Running tests
```bash
# Full attack test suite
clawsentinel test --attack-suite

# Individual test file via vitest
npx vitest run tests/attack-suite/t1-prompt-injection.ts
npx vitest run tests/attack-suite/t2-supply-chain.ts
```

---

## 9. Backup and restore

### What to back up

| File | Priority | Notes |
|------|----------|-------|
| `~/.clawsentinel/vault.key` | Critical | Losing this = permanent loss of all vault credentials |
| `~/.clawsentinel/config.json` | Important | Your settings — easy to recreate but worth keeping |
| `~/.clawsentinel/clawsentinel.db` | Nice to have | Audit logs and scan history — not required for operation |

### Backup command
```bash
# Create a dated backup
tar czf clawsentinel-backup-$(date +%Y%m%d).tar.gz \
  ~/.clawsentinel/vault.key \
  ~/.clawsentinel/config.json \
  ~/.clawsentinel/clawsentinel.db

# Store this in a safe location (not your OpenClaw workspace)
```

### Restore

```bash
# Stop ClawSentinel first
clawsentinel stop

# Extract backup
tar xzf clawsentinel-backup-20260225.tar.gz -C /

# Restart
clawsentinel start
```

### Vault key specifically

The vault.key file is the master encryption key for all credentials stored with `clawsentinel vault set`. If you lose it:
- All vault-stored credentials are permanently inaccessible (by design — they cannot be decrypted without the key)
- You will need to `vault set` all credentials again with new values from your API provider dashboards

**Best practice:** Keep a copy of `vault.key` in your password manager alongside a note of all credential names stored in ClawVault.

---

## 10. Upgrading

### npm install (Option A)
```bash
npm update -g clawsentinel

# After upgrading, restart:
clawsentinel stop
clawsentinel start
```

### Check for breaking changes
```bash
# View what changed
cat $(npm root -g)/clawsentinel/CHANGELOG.md | head -60
```

### From source (Option D)
```bash
git pull origin main
npm install
npm run build
clawsentinel stop
clawsentinel start
```

### Database migrations

The DB schema uses `CREATE TABLE IF NOT EXISTS` — it is safe to upgrade without any manual migration steps. New columns added in an upgrade will not automatically appear in existing tables, but all new installs get the latest schema. If you need to reset the schema:

```bash
clawsentinel stop
rm ~/.clawsentinel/clawsentinel.db
clawsentinel init   # recreates DB with latest schema
clawsentinel start
```

This loses event history but not your `config.json` or vault credentials.

---

## 11. Troubleshooting

### ClawGuard won't start

```bash
# Check if port 18790 is in use
lsof -i :18790

# Check if a stale PID file is blocking startup
cat ~/.clawsentinel/run/clawguard.pid
kill -0 $(cat ~/.clawsentinel/run/clawguard.pid)  # exits 0 if process exists

# Force-remove stale PID and restart
rm -f ~/.clawsentinel/run/clawguard.pid
clawsentinel start -m clawguard
```

### Port 18790 is already in use

```bash
# Find what's using it
lsof -i :18790

# Change ClawGuard's port
clawsentinel config set proxy.listenPort 18792
# Also update OpenClaw to connect to :18792
```

### OpenClaw can't connect

Symptom: OpenClaw errors like "connection refused" after you changed the WS URL.

```bash
# 1. Verify ClawGuard is running
clawsentinel status

# 2. Verify it's listening on the right port
lsof -i :18790

# 3. Check ClawGuard logs
clawsentinel logs --source clawguard -n 20

# 4. Temporarily test with the original port to confirm OpenClaw still works
# (Change OpenClaw back to ws://127.0.0.1:18789 temporarily)
```

### Everything is being blocked

ClawGuard may have a misconfigured threshold or a rule that is too aggressive.

```bash
# 1. Check what is being blocked
clawsentinel logs --severity block -n 20

# 2. Switch to monitor mode temporarily
clawsentinel config set clawguard.mode monitor
clawsentinel stop -m clawguard && clawsentinel start -m clawguard

# 3. If that fixes the problem, raise the block threshold
clawsentinel config set clawguard.blockThreshold 80

# 4. Switch back to enforce
clawsentinel config set clawguard.mode enforce
clawsentinel stop -m clawguard && clawsentinel start -m clawguard
```

### Semantic engine errors

If you see LLM errors in the logs, the semantic engine will silently fall back to pattern-only scoring. No action needed. To silence the errors:

```bash
# Disable semantic engine entirely
clawsentinel config set semanticEngine.enabled false

# Or switch to local Ollama (requires Ollama to be installed and running)
clawsentinel config set semanticEngine.ollama.enabled true
clawsentinel config set semanticEngine.ollama.model mistral
```

### ClawEye dashboard shows no data

```bash
# Check ClawEye is running
clawsentinel status

# Check it can reach the DB
clawsentinel logs --source system -n 5

# Try restarting ClawEye
clawsentinel stop -m claweye
clawsentinel start -m claweye

# Open the dashboard
open http://localhost:7432
```

### DB is corrupt or missing

```bash
clawsentinel stop
rm -f ~/.clawsentinel/clawsentinel.db \
      ~/.clawsentinel/clawsentinel.db-wal \
      ~/.clawsentinel/clawsentinel.db-shm
clawsentinel init    # recreates with fresh schema
clawsentinel start
```

This loses event history. Config and vault credentials are unaffected.

### Check which version is running

```bash
clawsentinel --version
# 0.6.1
```

---

## Quick reference card

```
SETUP
  clawsentinel init                          First-time setup

START / STOP
  clawsentinel start                         Start everything
  clawsentinel start --no-eye               Start without dashboard
  clawsentinel stop                          Stop everything
  clawsentinel stop --force                  Force kill
  clawsentinel stop -m clawguard            Stop one module
  clawsentinel status                        Show health

LOGS
  clawsentinel logs                          Last 50 events
  clawsentinel logs -f                      Follow real-time
  clawsentinel logs --severity block        Blocked only
  clawsentinel logs --severity critical     Critical only

SCANNING
  clawsentinel scan <skill-id>              Scan before install
  clawsentinel scan ./file.js               Scan local file
  clawsentinel scan <id> --json             JSON output

VAULT
  clawsentinel vault list                   List credentials
  clawsentinel vault set anthropic sk-...  Store Anthropic key
  clawsentinel vault delete <name>          Remove credential

CONFIG
  clawsentinel config list                  Show all settings
  clawsentinel config get clawguard.mode    Get one setting
  clawsentinel config set clawguard.mode monitor   Alert-only mode
  clawsentinel config reset                 Reset to defaults

MODULES
  clawsentinel enable <module>              Enable a module
  clawsentinel disable <module>             Disable a module

TESTING
  clawsentinel test --attack-suite          Run all 6 attack tests

UNINSTALL
  clawsentinel uninstall                    Remove all data
  npm uninstall -g clawsentinel             Remove the package

DASHBOARD
  http://localhost:7432                     ClawEye real-time dashboard
```

---

*ClawSentinel v0.6.1 — https://github.com/hshdevhub/clawsentinel*
