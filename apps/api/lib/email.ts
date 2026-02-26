// ClawSentinel API — Email via Resend
// API key loaded from Vercel Environment Variables — never hardcoded

import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const key = process.env['RESEND_API_KEY'];
    if (!key) throw new Error('RESEND_API_KEY must be set in Vercel Environment Variables');
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendActivationEmail(email: string, refreshToken: string): Promise<void> {
  const from = process.env['EMAIL_FROM'] ?? 'noreply@clawsentinel.dev';

  await getResend().emails.send({
    from,
    to: email,
    subject: 'Your ClawSentinel Pro activation key',
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px;">
  <div style="max-width: 560px; margin: 0 auto;">

    <div style="border-left: 3px solid #22c55e; padding-left: 20px; margin-bottom: 32px;">
      <h1 style="color: #22c55e; font-size: 22px; margin: 0 0 4px;">ClawSentinel Pro</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 0;">Subscription activated</p>
    </div>

    <p style="color: #d1d5db; line-height: 1.6;">
      Thank you for subscribing. Run this command in your terminal to activate Pro on your machine:
    </p>

    <div style="background: #111; border: 1px solid #22c55e33; border-radius: 6px; padding: 18px; margin: 24px 0;">
      <code style="color: #22c55e; font-size: 14px; word-break: break-all;">
        clawsentinel activate ${refreshToken}
      </code>
    </div>

    <div style="background: #1a1a1a; border-radius: 6px; padding: 16px; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 13px; margin: 0 0 8px;">What's now unlocked:</p>
      <ul style="color: #d1d5db; font-size: 13px; margin: 0; padding-left: 18px; line-height: 2;">
        <li>Semantic engine — LLM-assisted injection detection</li>
        <li>ClawEye correlation engine — multi-layer attack detection</li>
        <li>Silent background renewal — licence auto-renews every 23h</li>
      </ul>
    </div>

    <p style="color: #6b7280; font-size: 12px; line-height: 1.6; border-top: 1px solid #222; padding-top: 16px;">
      This key activates Pro on <strong style="color: #9ca3af;">one machine only</strong>.
      To switch to a new machine, run the same command on the new machine.<br><br>
      Manage your subscription: <a href="https://billing.stripe.com" style="color: #22c55e;">Stripe Billing Portal</a>
    </p>

  </div>
</body>
</html>
    `
  });
}
