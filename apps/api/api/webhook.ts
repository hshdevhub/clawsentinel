// ClawSentinel API — Stripe Webhook Handler
// Handles: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed
// Stripe signature verified on every request — fake events are rejected

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getStripe } from '../lib/stripe';
import { db } from '../lib/db';
import { sendActivationEmail } from '../lib/email';

export const config = {
  api: { bodyParser: false } // Must be raw bytes for Stripe signature verification
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const rawBody = await getRawBody(req);
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // Invalid signature — log and reject (could be an attack)
    console.error('Webhook signature verification failed:', String(err));
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;

        // Collect customer details
        const email = session.customer_details?.email
          ?? (session.customer_email as string | null);
        const stripeCustomerId = typeof session.customer === 'string'
          ? session.customer
          : null;

        if (!email || !stripeCustomerId) {
          console.error('checkout.session.completed: missing email or customer_id', {
            email, stripeCustomerId
          });
          break;
        }

        // Check if customer already exists (idempotency — Stripe may retry)
        const existing = await db.getByStripeId(stripeCustomerId);
        if (existing?.active) {
          console.log(`Customer ${stripeCustomerId} already active — skipping`);
          break;
        }

        // Generate a cryptographically random refresh token
        const refreshToken = crypto.randomBytes(32).toString('hex');

        await db.setCustomer({
          email,
          stripe_customer_id: stripeCustomerId,
          refresh_token: refreshToken,
          machine_id: null,
          active: true,
          plan: 'pro',
          created_at: new Date().toISOString()
        });

        await sendActivationEmail(email, refreshToken);
        console.log(`Pro subscription created: ${email} (${stripeCustomerId})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const stripeCustomerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : null;

        if (!stripeCustomerId) break;

        await db.revokeByStripeId(stripeCustomerId);
        console.log(`Subscription cancelled: ${stripeCustomerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // Log for monitoring — plan stays active until subscription is actually deleted
        console.warn(`Payment failed for customer: ${invoice.customer}`);
        break;
      }

      default:
        // Ignore other events
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 to prevent Stripe retrying — log the error for investigation
    res.status(200).json({ received: true, warning: 'Handler error logged' });
  }
}
