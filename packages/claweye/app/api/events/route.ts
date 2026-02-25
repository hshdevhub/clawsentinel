// ClawEye — REST events endpoint
// Returns paginated audit log with optional filters.
// Used by the dashboard on initial load before SSE connects.

import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env['CLAWSENTINEL_DB']
  ?? path.join(os.homedir(), '.clawsentinel', 'clawsentinel.db');

interface EventRow {
  id: string;
  timestamp: string;
  source: string;
  severity: string;
  category: string;
  description: string;
  payload: string;
  session_id: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit    = Math.min(parseInt(searchParams.get('limit')    ?? '100', 10), 500);
  const severity = searchParams.get('severity');
  const source   = searchParams.get('source');
  const since    = searchParams.get('since');   // ISO timestamp

  let db: Database.Database;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    db.pragma('journal_mode = WAL');
  } catch {
    return NextResponse.json({ events: [], total: 0, error: 'Database not yet initialized' }, { status: 200 });
  }

  try {
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: (string | number)[] = [];

    if (severity) { query += ' AND severity = ?'; params.push(severity); }
    if (source)   { query += ' AND source = ?';   params.push(source); }
    if (since)    { query += ' AND timestamp > ?'; params.push(since); }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as EventRow[];
    const total = (db.prepare('SELECT COUNT(*) as n FROM events').get() as { n: number }).n;

    const events = rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      source: r.source,
      severity: r.severity,
      category: r.category,
      description: r.description,
      payload: safeParseJson(r.payload),
      sessionId: r.session_id
    }));

    return NextResponse.json({ events, total });
  } catch (err) {
    return NextResponse.json({ events: [], total: 0, error: String(err) }, { status: 500 });
  } finally {
    db.close();
  }
}

function safeParseJson(str: string): unknown {
  try { return JSON.parse(str) as unknown; }
  catch { return {}; }
}
