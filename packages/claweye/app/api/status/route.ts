// ClawEye — Module health status endpoint
// Returns live health for all 5 ClawSentinel modules.
// Checks: process health endpoints + DB module_status table + port liveness.

import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env['CLAWSENTINEL_DB']
  ?? path.join(os.homedir(), '.clawsentinel', 'clawsentinel.db');

interface ModuleStatusRow {
  name: string;
  status: string;
  port: number | null;
  last_seen: string | null;
  message: string | null;
}

async function checkEndpoint(url: string, timeoutMs = 600): Promise<'online' | 'offline'> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

export async function GET() {
  // Live endpoint checks (non-blocking parallel)
  const [clawguardHealth, claweyeHealth] = await Promise.all([
    checkEndpoint('http://localhost:18791/health'),
    checkEndpoint('http://localhost:7432/api/status/ping')
  ]);

  // DB-persisted module status (written by each module on startup)
  let dbStatuses: ModuleStatusRow[] = [];
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    db.pragma('journal_mode = WAL');
    dbStatuses = db.prepare(
      `SELECT * FROM module_status ORDER BY name`
    ).all() as ModuleStatusRow[];
    db.close();
  } catch { /* DB not yet initialized */ }

  const dbMap = new Map(dbStatuses.map(s => [s.name, s]));

  // ClawVault and ClawHub Scanner run inside the ClawGuard process.
  // They have no independent health endpoint — infer from ClawGuard's status.
  const guardRunning = clawguardHealth === 'online';
  const inProcessStatus = guardRunning ? 'running' : 'stopped';

  const modules = [
    {
      name: 'clawbox',
      label: 'ClawBox',
      description: 'Hardened Docker deployment',
      icon: '🐳',
      // ClawBox requires explicit Docker setup — disabled until configured
      status: dbMap.get('clawbox')?.status ?? 'disabled',
      port: null
    },
    {
      name: 'clawvault',
      label: 'ClawVault',
      description: 'Encrypted credential store',
      icon: '🔐',
      status: inProcessStatus,
      port: null
    },
    {
      name: 'clawguard',
      label: 'ClawGuard',
      description: 'WebSocket + HTTP proxy',
      icon: '🛡️',
      status: guardRunning ? 'running' : (dbMap.get('clawguard')?.status ?? 'stopped'),
      port: 18790,
      healthUrl: 'http://localhost:18791/health'
    },
    {
      name: 'clawhub-scanner',
      label: 'ClawHub Scanner',
      description: 'Supply chain protection',
      icon: '🔍',
      status: inProcessStatus,
      port: null
    },
    {
      name: 'claweye',
      label: 'ClawEye',
      description: 'Security dashboard',
      icon: '👁️',
      status: 'running', // If this endpoint is responding, ClawEye is running
      port: 7432
    }
  ];

  return NextResponse.json({
    modules,
    checkedAt: new Date().toISOString()
  });
}
