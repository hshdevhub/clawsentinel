// ClawGuard — Process Entry Point (v0.7.0)
// Starts the WebSocket proxy, HTTP proxy, and ClawHub skill watcher.
// Run via: node dist/index.js
// Spawned by: clawsentinel start

import fs from 'fs';
import path from 'path';
import os from 'os';
import { eventBus, moduleLogger, getDb, readPlan, writePlan, getMachineId, hoursUntilExpiry } from '@clawsentinel/core';
import { startWSProxy } from './proxy/ws-proxy.js';
import { startHTTPProxy } from './proxy/http-proxy.js';
import { startClawHubScanner } from '@clawsentinel/clawhub-scanner';
import { taintTracker } from './engines/taint-tracker.js';

export const CLAWGUARD_VERSION = '0.7.0';

const log = moduleLogger('clawguard');

const RUN_DIR  = path.join(os.homedir(), '.clawsentinel', 'run');
const PID_FILE = path.join(RUN_DIR, 'clawguard.pid');

function writePid() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

function removePid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
}

function markStatus(status: 'running' | 'stopped' | 'error') {
  try {
    const db = getDb();
    db.prepare(`INSERT OR REPLACE INTO module_status
                  (name, status, version, started_at, updated_at)
                VALUES (?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(name) DO UPDATE SET
                  status     = excluded.status,
                  version    = excluded.version,
                  updated_at = datetime('now'),
                  started_at = CASE WHEN excluded.status = 'running' THEN datetime('now') ELSE started_at END`)
      .run('clawguard', status, CLAWGUARD_VERSION);
  } catch { /* DB may not be ready yet — non-fatal */ }
}

const API_BASE = process.env['CLAWSENTINEL_API_URL'] ?? 'https://api.clawsentinel.dev';
const RENEWAL_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 hours

/**
 * Silently renew the Pro access token.
 * Runs every 23 hours in the background — zero user action needed.
 * If renewal fails (cancelled subscription, no internet), the token simply
 * expires and isPro() returns false within 24h — no crash, no user-visible error.
 */
async function renewPlanIfNeeded(): Promise<void> {
  const plan = readPlan();
  if (plan.plan !== 'pro' || !plan.refresh_token) return;

  // Only renew if expiring within 2 hours (avoids unnecessary API calls)
  const hours = hoursUntilExpiry();
  if (hours > 2) return;

  try {
    const machineId = getMachineId();
    const res = await fetch(`${API_BASE}/api/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: plan.refresh_token, machine_id: machineId })
    });

    if (!res.ok) {
      log.warn('Plan renewal failed — will retry on next interval', { status: res.status });
      return;
    }

    const body = await res.json() as { access_token?: string; plan?: string };
    if (body.access_token) {
      writePlan({ ...plan, access_token: body.access_token });
      log.info('Pro plan renewed silently');
    } else {
      // Server returned { plan: 'free' } — subscription cancelled; drop access_token
      const { access_token: _tok, ...planWithoutToken } = plan;
      writePlan({ ...planWithoutToken, plan: 'free' });
      log.info('Subscription cancelled — plan downgraded to Free');
    }
  } catch (err) {
    log.warn('Plan renewal network error — will retry on next interval', { err: String(err) });
  }
}

async function main() {
  log.info(`ClawGuard v${CLAWGUARD_VERSION} starting`);
  writePid();

  // Initialise event bus (persists events to SQLite)
  eventBus.enablePersistence();
  markStatus('running');

  // Start the WebSocket proxy (:18790 → :18789)
  const listenPort = parseInt(process.env['LISTEN_PORT'] ?? '18790');
  const upstreamWs = process.env['UPSTREAM_WS'] ?? 'ws://127.0.0.1:18789';
  const wss = startWSProxy({ listenPort, upstreamUrl: upstreamWs });
  log.info(`WS proxy listening on :${listenPort} → ${upstreamWs}`);

  // Start the HTTP proxy (health :18791, tools intercept → :18789)
  const httpServer = startHTTPProxy();
  log.info('HTTP proxy started on :18791');

  // Start ClawHub skill watcher (monitors ~/.openclaw/skills for new/modified skills)
  try {
    startClawHubScanner();
    log.info('ClawHub Scanner watcher started');
  } catch (err) {
    log.warn('ClawHub Scanner could not start watcher', { err });
    // Non-fatal — proxy continues without watcher
  }

  log.info('ClawGuard ready — passthrough-first guarantee active');

  // ── Taint tracker cleanup (prevents memory leak over long sessions) ────────
  // Prunes session taint records older than 1 hour — runs every hour
  setInterval(() => taintTracker.pruneStaleRecords(), 60 * 60 * 1000).unref();

  // ── Background plan renewal (Pro only) ────────────────────────────────────
  // Check immediately on startup (covers the case where ClawGuard was offline
  // during the usual renewal window), then repeat every 23 hours.
  renewPlanIfNeeded().catch(() => { /* non-fatal */ });
  const renewalTimer = setInterval(() => {
    renewPlanIfNeeded().catch(() => { /* non-fatal */ });
  }, RENEWAL_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log.info(`Received ${signal} — shutting down`);
    clearInterval(renewalTimer);
    markStatus('stopped');
    removePid();
    wss.close(() => {
      httpServer.close(() => {
        log.info('ClawGuard stopped');
        process.exit(0);
      });
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => process.exit(0), 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', err => {
    log.error('Uncaught exception', { err: err.message });
    // Stay up — passthrough-first means OpenClaw must not be broken
  });

  process.on('unhandledRejection', reason => {
    log.warn('Unhandled rejection', { reason: String(reason) });
  });
}

main().catch(err => {
  console.error('[clawguard] Fatal startup error:', err);
  process.exit(1);
});
