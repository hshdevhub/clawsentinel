// ClawHub Scanner — Shell Execution Pattern Rules
// Detects dangerous shell/process execution in skill source code

export interface ScanRule {
  id: string;
  pattern: RegExp;
  weight: number;       // 1–10, added to raw score
  category: string;
  description: string;
  severity: 'warn' | 'block';
}

export const SHELL_PATTERNS: ScanRule[] = [
  {
    id: 'SH001',
    pattern: /\bexec\s*\(/,
    weight: 10,
    category: 'shell_exec',
    description: 'exec() — direct shell command execution',
    severity: 'block'
  },
  {
    id: 'SH002',
    pattern: /\bspawn\s*\(/,
    weight: 9,
    category: 'shell_exec',
    description: 'spawn() — child process execution',
    severity: 'block'
  },
  {
    id: 'SH003',
    pattern: /\bchild_process\b/,
    weight: 9,
    category: 'shell_exec',
    description: "child_process import — enables all shell execution APIs",
    severity: 'block'
  },
  {
    id: 'SH004',
    pattern: /\bexecSync\s*\(/,
    weight: 10,
    category: 'shell_exec',
    description: 'execSync() — blocking shell execution',
    severity: 'block'
  },
  {
    id: 'SH005',
    pattern: /\bspawnSync\s*\(/,
    weight: 9,
    category: 'shell_exec',
    description: 'spawnSync() — blocking child process',
    severity: 'block'
  },
  {
    id: 'SH006',
    pattern: /bash\s+-[ci]|sh\s+-[ci]|zsh\s+-[ci]|dash\s+-[ci]/,
    weight: 10,
    category: 'shell_exec',
    description: 'Shell invoked via -c/-i flag — command injection vector',
    severity: 'block'
  },
  {
    id: 'SH007',
    pattern: /\/bin\/(bash|sh|zsh|dash|ksh|csh)/,
    weight: 8,
    category: 'shell_exec',
    description: 'Direct shell binary path reference',
    severity: 'block'
  },
  {
    id: 'SH008',
    pattern: /\bnc\b|\bnetcat\b|\bncat\b/,
    weight: 10,
    category: 'reverse_shell',
    description: 'Netcat — classic reverse shell tool',
    severity: 'block'
  },
  {
    id: 'SH009',
    pattern: /\/dev\/tcp\//,
    weight: 10,
    category: 'reverse_shell',
    description: '/dev/tcp/ — bash reverse shell technique',
    severity: 'block'
  },
  {
    id: 'SH010',
    pattern: /mkfifo|mknod\s+.*\s+p\s/,
    weight: 10,
    category: 'reverse_shell',
    description: 'Named pipe creation — reverse shell enabler',
    severity: 'block'
  },
  {
    id: 'SH011',
    pattern: /\bchmod\s+[0-9]{3,4}\s/,
    weight: 7,
    category: 'shell_exec',
    description: 'chmod — file permission modification',
    severity: 'warn'
  },
  {
    id: 'SH012',
    pattern: /\bcrontab\b|\bat\s+[0-9]/,
    weight: 9,
    category: 'persistence',
    description: 'Cron/at job scheduling — persistence mechanism (T5)',
    severity: 'block'
  },
  {
    id: 'SH013',
    pattern: /\blaunchctl\b|\bsystemctl\s+enable\b/,
    weight: 9,
    category: 'persistence',
    description: 'Service registration — persistence mechanism',
    severity: 'block'
  },
  {
    id: 'SH014',
    pattern: /\bdd\s+if=/,
    weight: 9,
    category: 'shell_exec',
    description: 'dd — raw disk read/write command',
    severity: 'block'
  },
  {
    id: 'SH015',
    pattern: /\brm\s+-rf?\s+[\/~]/,
    weight: 10,
    category: 'destructive',
    description: 'rm -rf on root/home — destructive file deletion',
    severity: 'block'
  },
  {
    id: 'SH016',
    pattern: /\bpkill\b|\bkillall\b|\bkill\s+-9/,
    weight: 7,
    category: 'shell_exec',
    description: 'Force process termination',
    severity: 'warn'
  },
  {
    id: 'SH017',
    pattern: /require\s*\(\s*['"`]shelljs['"`]\)/,
    weight: 9,
    category: 'shell_exec',
    description: "shelljs import — shell execution library",
    severity: 'block'
  },
  {
    id: 'SH018',
    pattern: /require\s*\(\s*['"`]execa['"`]\)/,
    weight: 8,
    category: 'shell_exec',
    description: "execa import — process execution library",
    severity: 'warn'
  }
];
