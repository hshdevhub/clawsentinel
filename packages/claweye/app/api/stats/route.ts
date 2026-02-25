// ClawEye — Aggregate security stats endpoint
// Returns event counts by severity + top threat categories.
// Used by the security score gauge and stats bar.

import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env['CLAWSENTINEL_DB']
  ?? path.join(os.homedir(), '.clawsentinel', 'clawsentinel.db');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  // Default: last 24 hours
  const hoursBack = parseInt(searchParams.get('hours') ?? '24', 10);
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();

  let db: Database.Database;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    db.pragma('journal_mode = WAL');
  } catch {
    return NextResponse.json(emptyStats(), { status: 200 });
  }

  try {
    // Event counts by severity
    const severityCounts = db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM events
      WHERE timestamp >= ?
      GROUP BY severity
    `).all(since) as Array<{ severity: string; count: number }>;

    const counts: Record<string, number> = { info: 0, warn: 0, block: 0, critical: 0 };
    for (const row of severityCounts) {
      counts[row.severity] = row.count;
    }

    // Top threat categories
    const topCategories = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM events
      WHERE timestamp >= ? AND severity != 'info'
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `).all(since) as Array<{ category: string; count: number }>;

    // Events per hour (sparkline data — last 24 data points)
    const hourlyData = db.prepare(`
      SELECT
        strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN severity IN ('block','critical') THEN 1 ELSE 0 END) as blocked
      FROM events
      WHERE timestamp >= ?
      GROUP BY hour
      ORDER BY hour ASC
    `).all(since) as Array<{ hour: string; total: number; blocked: number }>;

    // Security score: starts at 100, deducts for threats
    const critical = counts['critical'] ?? 0;
    const block    = counts['block'] ?? 0;
    const warn     = counts['warn'] ?? 0;
    const score = Math.max(0, Math.round(
      100 - critical * 20 - block * 5 - warn * 1
    ));

    return NextResponse.json({
      score,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      topCategories,
      hourlyData,
      window: { hours: hoursBack, since }
    });
  } catch (err) {
    return NextResponse.json({ ...emptyStats(), error: String(err) }, { status: 500 });
  } finally {
    db.close();
  }
}

function emptyStats() {
  return {
    score: 100,
    counts: { info: 0, warn: 0, block: 0, critical: 0 },
    total: 0,
    topCategories: [],
    hourlyData: [],
    window: { hours: 24, since: new Date().toISOString() }
  };
}
