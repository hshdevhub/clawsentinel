// ClawSentinel API — Token Activation
// Exchanges a refresh_token for a 24h access_token (JWT)
// Locks the token to the machine_id on first use

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../lib/db';
import { signAccessToken } from '../lib/jwt';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as { refresh_token?: string; machine_id?: string } | undefined;
  const refresh_token = body?.refresh_token?.trim();
  const machine_id    = body?.machine_id?.trim();

  if (!refresh_token || !machine_id) {
    res.status(400).json({ error: 'refresh_token and machine_id are required' });
    return;
  }

  // Basic token format check — 64 hex chars
  if (!/^[a-f0-9]{64}$/.test(refresh_token)) {
    res.status(401).json({ error: 'Invalid activation key format' });
    return;
  }

  const customer = await db.getByToken(refresh_token);

  if (!customer) {
    res.status(401).json({ error: 'Invalid activation key — not found' });
    return;
  }

  if (!customer.active) {
    res.status(401).json({ error: 'Subscription is no longer active. Visit billing.stripe.com to resubscribe.' });
    return;
  }

  // Lock machine_id on first activation, or update on re-activation (new machine)
  await db.updateMachineId(refresh_token, machine_id);

  const access_token = signAccessToken({
    plan: 'pro',
    email: customer.email,
    sub:   customer.stripe_customer_id
  });

  res.status(200).json({
    access_token,
    plan:  'pro',
    email: customer.email
  });
}
