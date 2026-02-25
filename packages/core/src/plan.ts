// ClawSentinel Core — Plan checker
// Reads ~/.clawsentinel/plan.json and decodes the JWT expiry locally
// No signature verification here — server verifies on every Pro API call
// CLI uses this for gating UI and skipping unnecessary API calls

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const PLAN_FILE = path.join(os.homedir(), '.clawsentinel', 'plan.json');

export interface PlanData {
  plan: 'free' | 'pro';
  email?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
}

/** Decode JWT payload without verifying signature (base64 only) */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readPlan(): PlanData {
  try {
    if (!fs.existsSync(PLAN_FILE)) return { plan: 'free' };

    const raw = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')) as PlanData;

    if (raw.access_token) {
      const decoded = decodeJwtPayload(raw.access_token);
      const exp = typeof decoded?.['exp'] === 'number' ? decoded['exp'] : 0;
      const plan = decoded?.['plan'] === 'pro' ? 'pro' : 'free';

      if (exp * 1000 > Date.now()) {
        return { ...raw, plan };
      }
    }

    // Token expired or missing — fall back to free (renewal will fix this)
    return { ...raw, plan: 'free' };
  } catch {
    return { plan: 'free' };
  }
}

export function writePlan(data: PlanData): void {
  const dir = path.dirname(PLAN_FILE);
  fs.mkdirSync(dir, { recursive: true });

  // Derive expires_at from JWT exp claim
  if (data.access_token && !data.expires_at) {
    const decoded = decodeJwtPayload(data.access_token);
    const exp = typeof decoded?.['exp'] === 'number' ? decoded['exp'] : 0;
    if (exp > 0) {
      data.expires_at = new Date(exp * 1000).toISOString();
    }
  }

  fs.writeFileSync(PLAN_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function isPro(): boolean {
  return readPlan().plan === 'pro';
}

/** Returns hours until the access token expires (0 if expired/free) */
export function hoursUntilExpiry(): number {
  const plan = readPlan();
  if (plan.plan !== 'pro' || !plan.expires_at) return 0;
  const ms = new Date(plan.expires_at).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 3_600_000));
}

/** Generate machine fingerprint for anti-sharing lock */
export function getMachineId(): string {
  const cpuModel = os.cpus()[0]?.model ?? 'unknown';
  const raw = [
    os.hostname(),
    os.platform(),
    os.userInfo().username,
    cpuModel
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
