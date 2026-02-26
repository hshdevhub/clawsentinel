// ClawSentinel API — Stripe client
// API key loaded from Vercel Environment Variables — never hardcoded

import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) throw new Error('STRIPE_SECRET_KEY must be set in Vercel Environment Variables');
    stripeClient = new Stripe(key, {
      apiVersion: '2026-02-25.clover'
    });
  }
  return stripeClient;
}
