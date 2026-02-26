// ClawSentinel API — Database abstraction
// Uses Upstash Redis via Vercel Storage integration (HTTP-based, works on Vercel serverless + locally)
// All env vars come from Vercel Environment Variables — never hardcoded
// Setup: Vercel Dashboard → Storage → Create Database → Upstash → env vars auto-populate

import { Redis } from '@upstash/redis';

export interface CustomerRecord {
  email: string;
  stripe_customer_id: string;
  refresh_token: string;
  machine_id: string | null;
  active: boolean;
  plan: 'pro' | 'free';
  created_at: string;
}

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url   = process.env['KV_REST_API_URL'];
    const token = process.env['KV_REST_API_TOKEN'];
    if (!url || !token) {
      throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set — connect Upstash in Vercel Dashboard → Storage');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

// Key schema:
//   customer:<stripe_customer_id>  → CustomerRecord (JSON)
//   token:<refresh_token>          → stripe_customer_id  (index for fast lookup)

export const db = {
  async setCustomer(customer: CustomerRecord): Promise<void> {
    const r = getRedis();
    await Promise.all([
      r.set(`customer:${customer.stripe_customer_id}`, JSON.stringify(customer)),
      r.set(`token:${customer.refresh_token}`, customer.stripe_customer_id)
    ]);
  },

  async getByToken(refresh_token: string): Promise<CustomerRecord | null> {
    const r = getRedis();
    const stripeId = await r.get<string>(`token:${refresh_token}`);
    if (!stripeId) return null;
    const raw = await r.get<string>(`customer:${stripeId}`);
    if (!raw) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as CustomerRecord;
  },

  async getByStripeId(stripe_customer_id: string): Promise<CustomerRecord | null> {
    const r = getRedis();
    const raw = await r.get<string>(`customer:${stripe_customer_id}`);
    if (!raw) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as CustomerRecord;
  },

  async updateMachineId(refresh_token: string, machine_id: string): Promise<void> {
    const r = getRedis();
    const stripeId = await r.get<string>(`token:${refresh_token}`);
    if (!stripeId) return;
    const raw = await r.get<string>(`customer:${stripeId}`);
    if (!raw) return;
    const customer = (typeof raw === 'string' ? JSON.parse(raw) : raw) as CustomerRecord;
    customer.machine_id = machine_id;
    await r.set(`customer:${stripeId}`, JSON.stringify(customer));
  },

  async revokeByStripeId(stripe_customer_id: string): Promise<void> {
    const r = getRedis();
    const raw = await r.get<string>(`customer:${stripe_customer_id}`);
    if (!raw) return;
    const customer = (typeof raw === 'string' ? JSON.parse(raw) : raw) as CustomerRecord;
    customer.active = false;
    customer.plan = 'free';
    await r.set(`customer:${stripe_customer_id}`, JSON.stringify(customer));
  }
};
