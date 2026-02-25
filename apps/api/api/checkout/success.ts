// Checkout success page — shown after payment
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <title>ClawSentinel Pro — Activated</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: 'Courier New', monospace; background: #0a0a0a; color: #e5e5e5;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .card { max-width: 480px; padding: 40px; border: 1px solid #22c55e33; border-radius: 8px; }
    h1 { color: #22c55e; font-size: 22px; margin: 0 0 16px; }
    p { color: #9ca3af; line-height: 1.6; margin: 0 0 12px; }
    code { background: #111; color: #22c55e; padding: 12px 16px; display: block;
           border-radius: 6px; margin: 16px 0; font-size: 13px; word-break: break-all; }
    .dim { color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✓ Payment successful</h1>
    <p>Check your email — your activation key has been sent.</p>
    <p>Run this in your terminal:</p>
    <code>clawsentinel activate &lt;key-from-email&gt;</code>
    <p class="dim">Key not received? Check your spam folder or contact support.</p>
  </div>
</body>
</html>`);
}
