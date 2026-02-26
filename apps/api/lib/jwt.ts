// ClawSentinel API — JWT utilities
// Signs access tokens with HS256 using JWT_SECRET from Vercel Environment Variables
// CLI decodes (never verifies) — real enforcement is server-side on every Pro API call

import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  plan: 'pro' | 'free';
  email: string;
  sub: string; // stripe_customer_id
}

function getSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET must be set in Vercel Environment Variables');
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters (256+ bits for HS256)');
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: '24h',
    algorithm: 'HS256'
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload & { exp: number; iat: number } {
  return jwt.verify(token, getSecret(), {
    algorithms: ['HS256']
  }) as AccessTokenPayload & { exp: number; iat: number };
}
