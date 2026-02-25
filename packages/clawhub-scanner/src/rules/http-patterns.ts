// ClawHub Scanner — Outbound HTTP Pattern Rules
// Detects suspicious external HTTP calls and data exfiltration

import type { ScanRule } from './shell-patterns.js';

// Domains that skills are legitimately allowed to call
const ALLOWED_DOMAINS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'clawhub.ai',
  'openclaw.ai',
  'registry.npmjs.org',
  'raw.githubusercontent.com',
  'github.com'
];

const allowedDomainPattern = ALLOWED_DOMAINS.map(d => d.replace('.', '\\.')).join('|');

export const HTTP_PATTERNS: ScanRule[] = [
  {
    id: 'HTTP001',
    pattern: new RegExp(`fetch\\s*\\(\\s*['"\`]https?://(?!(?:${allowedDomainPattern}))`),
    weight: 6,
    category: 'http_exfil',
    description: 'Outbound fetch to non-allowlisted domain',
    severity: 'warn'
  },
  {
    id: 'HTTP002',
    pattern: /fetch\s*\(.*process\.env/,
    weight: 9,
    category: 'http_exfil',
    description: 'fetch with env var — possible key exfiltration (T7)',
    severity: 'block'
  },
  {
    id: 'HTTP003',
    pattern: /https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}\/.{0,60}(?:key|token|secret|credential|password|apikey)/i,
    weight: 10,
    category: 'http_exfil',
    description: 'HTTP URL with credential-like query parameter',
    severity: 'block'
  },
  {
    id: 'HTTP004',
    pattern: new RegExp(`(?:axios|got|superagent|needle|node-fetch)\\s*\\.\\s*(?:get|post|put|delete)\\s*\\(\\s*['"\`]https?://(?!(?:${allowedDomainPattern}))`),
    weight: 6,
    category: 'http_exfil',
    description: 'HTTP client call to non-allowlisted domain',
    severity: 'warn'
  },
  {
    id: 'HTTP005',
    pattern: /\bXMLHttpRequest\b/,
    weight: 4,
    category: 'http_exfil',
    description: 'XMLHttpRequest — low-level HTTP (unusual in skills)',
    severity: 'warn'
  },
  {
    id: 'HTTP006',
    pattern: /https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/,
    weight: 8,
    category: 'ssrf',
    description: 'HTTP call to RFC 1918 private IP — SSRF risk',
    severity: 'block'
  },
  {
    id: 'HTTP007',
    pattern: /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)/,
    weight: 7,
    category: 'ssrf',
    description: 'HTTP call to loopback address — SSRF / local service access',
    severity: 'block'
  },
  {
    id: 'HTTP008',
    pattern: /\.onion\b/,
    weight: 10,
    category: 'http_exfil',
    description: 'Tor .onion address — covert exfiltration channel',
    severity: 'block'
  },
  {
    id: 'HTTP009',
    pattern: /dns\.resolve|dns\.lookup.*https?:/,
    weight: 7,
    category: 'dns_exfil',
    description: 'DNS lookup with HTTP — possible DNS exfiltration',
    severity: 'warn'
  },
  {
    id: 'HTTP010',
    pattern: /new\s+Image\s*\(\s*\).*src\s*=.*https?:/,
    weight: 8,
    category: 'http_exfil',
    description: 'Image beacon — covert HTTP GET exfiltration technique',
    severity: 'block'
  },
  {
    id: 'HTTP011',
    pattern: /sendBeacon\s*\(/,
    weight: 7,
    category: 'http_exfil',
    description: 'sendBeacon — fire-and-forget HTTP (common in exfil)',
    severity: 'warn'
  },
  {
    id: 'HTTP012',
    pattern: /atob\s*\(.*\)\s*.*fetch|fetch.*atob\s*\(/,
    weight: 10,
    category: 'http_exfil',
    description: 'base64-decoded URL used in fetch — obfuscated exfil endpoint',
    severity: 'block'
  }
];
