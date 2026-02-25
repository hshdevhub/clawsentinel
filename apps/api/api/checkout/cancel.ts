// Checkout cancel page — shown when user closes Stripe Checkout
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <title>ClawSentinel — Checkout Cancelled</title>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Courier New', monospace; background: #0a0a0a; color: #e5e5e5;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .card { max-width: 480px; padding: 40px; border: 1px solid #374151; border-radius: 8px; }
    h1 { color: #9ca3af; font-size: 22px; margin: 0 0 16px; }
    p  { color: #6b7280; line-height: 1.6; margin: 0 0 12px; }
    code { background: #111; color: #22c55e; padding: 10px 14px; display: inline-block;
           border-radius: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Checkout cancelled</h1>
    <p>No charge was made. ClawSentinel Free is still fully active.</p>
    <p>To try again: <code>clawsentinel upgrade</code></p>
  </div>
</body>
</html>`);
}
