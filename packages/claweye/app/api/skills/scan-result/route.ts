// ClawEye — Skill scan result API
// Serves cached scan results to the Chrome extension badge injector.
// Returns the most recent scan for a given skill ID from the skill_scans table.

import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env['CLAWSENTINEL_DB']
  ?? path.join(os.homedir(), '.clawsentinel', 'clawsentinel.db');

interface SkillScanRow {
  skill_id: string;
  verdict: string;
  score: number;
  findings: string;
  scanned_at: string;
}

export async function GET(req: NextRequest) {
  const skillId = req.nextUrl.searchParams.get('id');
  if (!skillId) {
    return NextResponse.json({ error: 'Missing skill id parameter' }, { status: 400 });
  }

  // CORS — allow Chrome extension content scripts to call this
  const headers = { 'Access-Control-Allow-Origin': '*' };

  let db: Database.Database;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    db.pragma('journal_mode = WAL');
  } catch {
    return NextResponse.json({ error: 'Database not initialized' }, { status: 503, headers });
  }

  try {
    const row = db.prepare(
      `SELECT * FROM skill_scans WHERE skill_id = ? ORDER BY scanned_at DESC LIMIT 1`
    ).get(skillId) as SkillScanRow | undefined;

    if (!row) {
      return NextResponse.json(
        { error: 'Skill not yet scanned', skillId },
        { status: 404, headers }
      );
    }

    const findings = safeParseArray(row.findings);

    return NextResponse.json({
      skillId: row.skill_id,
      verdict: row.verdict,
      score: row.score,
      status: row.verdict === 'safe' ? 'safe' : row.verdict === 'warn' ? 'warning' : 'danger',
      findings,
      scannedAt: row.scanned_at,
      source: 'platform'
    }, { headers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers });
  } finally {
    db.close();
  }
}

function safeParseArray(str: string): unknown[] {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
