// ClawEye — Server-Sent Events stream
// Polls SQLite every 2s for new events and pushes them to all connected clients.
// Works across process boundaries — ClawGuard and ClawHub write to the same DB.

import { NextRequest } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { getCorrelationEngine } from '../../../../src/correlation';
import { isPro } from '@clawsentinel/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env['CLAWSENTINEL_DB']
  ?? path.join(os.homedir(), '.clawsentinel', 'clawsentinel.db');

const POLL_INTERVAL_MS = 2000;

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
  const encoder = new TextEncoder();
  const correlation = isPro() ? getCorrelationEngine() : null;

  const stream = new ReadableStream({
    start(controller) {
      let db: Database.Database | null = null;
      let lastTimestamp = new Date(Date.now() - 5 * 60_000).toISOString(); // Last 5 min on connect
      let interval: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      const ping = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch { closed = true; }
      };

      try {
        db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
        db.pragma('journal_mode = WAL');
      } catch {
        // DB not yet initialized — send empty heartbeat and wait
        send({ type: 'status', message: 'Waiting for ClawSentinel to initialize…' });
      }

      interval = setInterval(() => {
        if (closed) {
          if (interval) clearInterval(interval);
          return;
        }

        // Run correlation engine periodically (Pro only)
        try {
          correlation?.evaluate();
        } catch { /* correlation errors are non-fatal */ }

        if (!db) {
          // Retry DB connection
          try {
            db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
            db.pragma('journal_mode = WAL');
          } catch { ping(); return; }
        }

        try {
          const rows = db.prepare(
            `SELECT * FROM events WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 50`
          ).all(lastTimestamp) as EventRow[];

          for (const row of rows) {
            send({
              id: row.id,
              timestamp: row.timestamp,
              source: row.source,
              severity: row.severity,
              category: row.category,
              description: row.description,
              payload: safeParseJson(row.payload),
              sessionId: row.session_id
            });
            lastTimestamp = row.timestamp;
          }

          if (rows.length === 0) ping(); // Keep-alive
        } catch {
          ping(); // DB read error — keep connection alive
        }
      }, POLL_INTERVAL_MS);

      // Detect client disconnect
      req.signal.addEventListener('abort', () => {
        closed = true;
        if (interval) clearInterval(interval);
        db?.close();
        try { controller.close(); } catch { /* already closed */ }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    }
  });
}

function safeParseJson(str: string): unknown {
  try { return JSON.parse(str) as unknown; }
  catch { return {}; }
}
