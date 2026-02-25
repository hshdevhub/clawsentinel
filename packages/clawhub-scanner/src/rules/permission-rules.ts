// ClawHub Scanner — Permission & Sensitive Access Rules
// Detects over-broad permissions, credential access, and sensitive path reads

import type { ScanRule } from './shell-patterns.js';

export const PERMISSION_RULES: ScanRule[] = [
  // Credential file access
  {
    id: 'PERM001',
    pattern: /~\/\.ssh\/|\/\.ssh\//,
    weight: 10,
    category: 'credential_access',
    description: 'SSH key directory access',
    severity: 'block'
  },
  {
    id: 'PERM002',
    pattern: /~\/\.aws\/|\/\.aws\//,
    weight: 10,
    category: 'credential_access',
    description: 'AWS credentials directory access',
    severity: 'block'
  },
  {
    id: 'PERM003',
    pattern: /~\/\.openclaw\/config|openclaw\/config\.json/,
    weight: 10,
    category: 'credential_access',
    description: 'OpenClaw config access — contains API keys',
    severity: 'block'
  },
  {
    id: 'PERM004',
    pattern: /~\/\.gnupg\/|\/\.gnupg\//,
    weight: 10,
    category: 'credential_access',
    description: 'GPG keyring access',
    severity: 'block'
  },
  {
    id: 'PERM005',
    pattern: /~\/\.kube\/|\/\.kube\//,
    weight: 9,
    category: 'credential_access',
    description: 'Kubernetes config access',
    severity: 'block'
  },
  {
    id: 'PERM006',
    pattern: /~\/\.docker\/config\.json/,
    weight: 9,
    category: 'credential_access',
    description: 'Docker credentials access',
    severity: 'block'
  },
  // Environment variable access
  {
    id: 'PERM007',
    pattern: /process\.env\s*\.\s*(?:ANTHROPIC|OPENAI|GEMINI|CLAUDE|GPT|API)[_A-Z]*KEY/i,
    weight: 10,
    category: 'credential_access',
    description: 'Direct access to AI API key env vars',
    severity: 'block'
  },
  {
    id: 'PERM008',
    pattern: /process\.env\.(?:AWS_SECRET|AWS_ACCESS_KEY|GITHUB_TOKEN|NPM_TOKEN)/,
    weight: 10,
    category: 'credential_access',
    description: 'Access to cloud/service credential env vars',
    severity: 'block'
  },
  {
    id: 'PERM009',
    pattern: /Object\.keys\s*\(\s*process\.env\s*\)|JSON\.stringify\s*\(\s*process\.env\s*\)/,
    weight: 9,
    category: 'credential_access',
    description: 'Bulk environment variable dump — credential exfiltration',
    severity: 'block'
  },
  // Sensitive system paths
  {
    id: 'PERM010',
    pattern: /\/etc\/passwd|\/etc\/shadow|\/etc\/sudoers/,
    weight: 10,
    category: 'system_access',
    description: 'Unix credential/auth file access',
    severity: 'block'
  },
  {
    id: 'PERM011',
    pattern: /\/proc\/[0-9]+\/(?:mem|maps|environ)|\/proc\/self\//,
    weight: 9,
    category: 'system_access',
    description: '/proc filesystem access — memory/process inspection',
    severity: 'block'
  },
  {
    id: 'PERM012',
    pattern: /\/var\/log\/(?:auth|secure|syslog)/,
    weight: 8,
    category: 'system_access',
    description: 'System auth/security log access',
    severity: 'warn'
  },
  // Filesystem over-permissions
  {
    id: 'PERM013',
    pattern: /fs\.readdir\s*\(\s*['"`]\/['"`]|fs\.readdir\s*\(\s*['"`]~['"`]/,
    weight: 7,
    category: 'filesystem',
    description: 'Directory listing of root or home — broad filesystem access',
    severity: 'warn'
  },
  {
    id: 'PERM014',
    pattern: /glob\s*\(\s*['"`][*\/]{1,3}\*\*/,
    weight: 6,
    category: 'filesystem',
    description: 'Recursive glob from root — filesystem enumeration',
    severity: 'warn'
  },
  // Embedded injection payload in skill system prompt
  {
    id: 'PERM015',
    pattern: /systemPrompt\s*[:=]\s*['"`][^'"]*(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?|you\s+are\s+now\s+in\s+(?:developer|jailbreak|god|dan)\s+mode)/i,
    weight: 10,
    category: 'embedded_injection',
    description: 'Prompt injection payload embedded in skill system prompt (T2)',
    severity: 'block'
  },
  {
    id: 'PERM016',
    pattern: /(?:instructions?|prompt|system)\s*[:=]\s*['"`][^'"]*(?:send|forward|exfil).{0,60}https?:\/\//i,
    weight: 10,
    category: 'embedded_injection',
    description: 'Exfiltration URL embedded in skill prompt',
    severity: 'block'
  },
  // Native addons
  {
    id: 'PERM017',
    pattern: /require\s*\(\s*['"`][^'"]*\.node['"`]\)/,
    weight: 8,
    category: 'native_addon',
    description: 'Native .node addon — arbitrary native code execution',
    severity: 'block'
  },
  {
    id: 'PERM018',
    pattern: /process\.dlopen\s*\(/,
    weight: 9,
    category: 'native_addon',
    description: 'process.dlopen() — dynamic native library loading',
    severity: 'block'
  }
];
