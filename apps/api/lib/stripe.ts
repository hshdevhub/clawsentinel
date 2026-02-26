// ClawSentinel API — Stripe client
// API key loaded from Vercel Environment Variables — never hardcoded

import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) throw new Error('STRIPE_SECRET_KEY must be set in Vercel Environment Variables');
    stripeClient = new Stripe(key, {
      apiVersion: '2025-02-24.acacia'
    });
  }
  return stripeClient;
}
