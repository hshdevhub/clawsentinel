// ClawSentinel API — Stripe Checkout Session
// Creates a hosted Stripe Checkout session with 7-day free trial
// CLI runs: clawsentinel upgrade → opens this URL in browser → redirects to Stripe

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripe } from '../lib/stripe';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const priceId = process.env['STRIPE_PRICE_ID'];
  if (!priceId) {
    console.error('STRIPE_PRICE_ID not configured');
    res.status(500).json({ error: 'Billing not configured' });
    return;
  }

  const baseUrl = process.env['API_BASE_URL'] ?? 'https://clawsentinel-api.vercel.app';

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7
      },
      // Collect email so webhook can send the activation key
      customer_creation: 'always',
      success_url: `${baseUrl}/api/checkout/success`,
      cancel_url:  `${baseUrl}/api/checkout/cancel`
    });

    if (session.url) {
      // Redirect browser to Stripe Checkout
      res.redirect(302, session.url);
    } else {
      res.status(500).json({ error: 'Could not create checkout session' });
    }
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
