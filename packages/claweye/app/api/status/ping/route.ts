// ClawEye self-health ping — used by the /api/status endpoint for liveness checks.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({ ok: true, service: 'claweye', ts: new Date().toISOString() });
}
