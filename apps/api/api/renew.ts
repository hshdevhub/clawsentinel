// ClawSentinel API — Token Renewal
// Called every 23h by the CLI background task
// Returns a new 24h access_token OR { plan: 'free' } if subscription cancelled
// Machine ID is verified — different machine = downgrade (token was shared)

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

  const customer = await db.getByToken(refresh_token);

  // Subscription cancelled or token not found → downgrade to free silently
  if (!customer || !customer.active) {
    res.status(200).json({ plan: 'free' });
    return;
  }

  // Machine ID mismatch: someone activated on a different machine
  // The new machine "wins" — update to it (one active machine at a time)
  if (customer.machine_id && customer.machine_id !== machine_id) {
    await db.updateMachineId(refresh_token, machine_id);
  }

  const access_token = signAccessToken({
    plan:  'pro',
    email: customer.email,
    sub:   customer.stripe_customer_id
  });

  res.status(200).json({
    access_token,
    plan:  'pro',
    email: customer.email
  });
}
