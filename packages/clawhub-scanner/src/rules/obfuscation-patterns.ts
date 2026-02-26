// ClawHub Scanner — Obfuscation & Encoding Pattern Rules
// Detects eval, base64, encoding tricks used to hide malicious payloads

import type { ScanRule } from './shell-patterns.js';

export const OBFUSCATION_PATTERNS: ScanRule[] = [
  {
    id: 'OBF001',
    pattern: /\beval\s*\(/,
    weight: 9,
    category: 'obfuscation',
    description: 'eval() — executes arbitrary string as code',
    severity: 'block'
  },
  {
    id: 'OBF002',
    pattern: /\bnew\s+Function\s*\(/,
    weight: 9,
    category: 'obfuscation',
    description: 'new Function() — dynamic code execution (eval variant)',
    severity: 'block'
  },
  {
    id: 'OBF003',
    pattern: /\batob\s*\(/,
    weight: 7,
    category: 'obfuscation',
    description: 'atob() — base64 decode in browser context',
    severity: 'warn'
  },
  {
    id: 'OBF004',
    pattern: /Buffer\.from\s*\([^,)]+,\s*['"`]base64['"`]\)/,
    weight: 7,
    category: 'obfuscation',
    description: 'Buffer.from(…, "base64") — base64 decode in Node.js',
    severity: 'warn'
  },
  {
    id: 'OBF005',
    pattern: /eval\s*\(\s*(?:Buffer\.from|atob)/,
    weight: 10,
    category: 'obfuscation',
    description: 'eval(base64decode()) — execute decoded payload',
    severity: 'block'
  },
  {
    id: 'OBF006',
    pattern: /\bvm\.runInThisContext\b|\bvm\.runInNewContext\b/,
    weight: 9,
    category: 'obfuscation',
    description: 'Node.js vm module — sandbox escape execution',
    severity: 'block'
  },
  {
    id: 'OBF007',
    pattern: /\bvm\.Script\b/,
    weight: 8,
    category: 'obfuscation',
    description: 'vm.Script — compiled dynamic code execution',
    severity: 'block'
  },
  {
    id: 'OBF008',
    pattern: /\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){4,}/,
    weight: 6,
    category: 'obfuscation',
    description: 'Hex-encoded string sequence — obfuscated payload',
    severity: 'warn'
  },
  {
    id: 'OBF009',
    pattern: /\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){3,}/,
    weight: 5,
    category: 'obfuscation',
    description: 'Unicode escape sequence — obfuscated identifiers',
    severity: 'warn'
  },
  {
    id: 'OBF010',
    pattern: /String\.fromCharCode\s*\(\s*\d+\s*(?:,\s*\d+\s*){5,}\)/,
    weight: 7,
    category: 'obfuscation',
    description: 'String.fromCharCode with many args — char-code obfuscation',
    severity: 'warn'
  },
  {
    id: 'OBF011',
    pattern: /\[\s*(['"`])[^'"`]+\1\s*\]\s*\[/,
    weight: 4,
    category: 'obfuscation',
    description: 'Bracket notation property access — property name hiding',
    severity: 'warn'
  },
  {
    id: 'OBF012',
    pattern: /setTimeout\s*\(\s*['"`][^'"]+['"`]/,
    weight: 6,
    category: 'obfuscation',
    description: 'setTimeout with string arg — deferred eval() equivalent',
    severity: 'warn'
  },
  {
    id: 'OBF013',
    pattern: /setInterval\s*\(\s*['"`][^'"]+['"`]/,
    weight: 6,
    category: 'obfuscation',
    description: 'setInterval with string arg — repeated eval() equivalent',
    severity: 'warn'
  },
  {
    id: 'OBF014',
    pattern: /\.constructor\s*\(\s*['"`][^'"]{10,}['"`]\)\s*\(\s*\)/,
    weight: 9,
    category: 'obfuscation',
    description: 'constructor() string invocation — eval bypass technique',
    severity: 'block'
  },
  {
    id: 'OBF015',
    pattern: /require\s*\(\s*(?:Buffer\.from|atob)\s*\(/,
    weight: 10,
    category: 'obfuscation',
    description: 'require(base64decode()) — obfuscated dynamic require',
    severity: 'block'
  }
];
