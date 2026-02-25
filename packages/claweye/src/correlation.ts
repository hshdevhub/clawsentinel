// ClawEye — Correlation Engine
// Detects multi-step attack patterns by analysing sequences of security events.
// Events are loaded from SQLite and evaluated against a set of correlation rules.
// When a rule fires, a 'critical' correlation alert is written to the events table.

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = process.env['CLAWSENTINEL_DB']
  ?? path.join(os.homedir(), '.clawsentinel', 'clawsentinel.db');

// Correlation window: events within this period are considered related
const CORRELATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export interface CorrelationAlert {
  ruleId: string;
  ruleName: string;
  severity: 'critical';
  description: string;
  eventCount: number;
  windowMs: number;
  firedAt: string;
}

interface EventRow {
  id: string;
  timestamp: string;
  source: string;
  severity: string;
  category: string;
  description: string;
  payload: string;
  session_id: string | null;
}

interface CorrelationRule {
  id: string;
  name: string;
  description: string;
  check: (events: EventRow[]) => boolean;
}

const RULES: CorrelationRule[] = [
  // Rule 1: Supply chain + injection + credential — full kill chain
  {
    id: 'CORR001',
    name: 'full_kill_chain',
    description: 'Multi-step attack: suspicious skill install → injection attempt → credential access',
    check: (events) => {
      const hasSkillWarn = events.some(e =>
        (e.source === 'clawhub-scanner') && (e.severity === 'warn' || e.severity === 'block')
      );
      const hasInjection = events.some(e =>
        e.source === 'clawguard' && e.category === 'injection' && e.severity !== 'info'
      );
      const hasCredential = events.some(e =>
        e.source === 'clawvault' && e.category === 'credential'
      );
      return hasSkillWarn && hasInjection && hasCredential;
    }
  },

  // Rule 2: Memory write with exfiltration URL (T6 attack)
  {
    id: 'CORR002',
    name: 'memory_exfil_backdoor',
    description: 'Persistent backdoor: memory write containing outbound URL',
    check: (events) => events.some(e => {
      if (e.source !== 'clawguard' || e.category !== 'injection') return false;
      try {
        const payload = JSON.parse(e.payload) as Record<string, unknown>;
        const desc = e.description ?? '';
        return desc.toLowerCase().includes('memory') &&
               /https?:\/\/|(\d{1,3}\.){3}\d{1,3}/.test(JSON.stringify(payload));
      } catch { return false; }
    })
  },

  // Rule 3: Repeated credential denials — credential probing
  {
    id: 'CORR003',
    name: 'credential_probing',
    description: 'Credential probing: 3+ vault denial events in correlation window',
    check: (events) => {
      const denials = events.filter(e =>
        e.source === 'clawvault' && e.description.toLowerCase().includes('denied')
      );
      return denials.length >= 3;
    }
  },

  // Rule 4: Block followed immediately by another block — persistent attacker
  {
    id: 'CORR004',
    name: 'persistent_attacker',
    description: 'Persistent attacker: 3+ blocked events within 5 minutes',
    check: (events) => {
      const blocks = events
        .filter(e => e.severity === 'block' || e.severity === 'critical')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (blocks.length < 3) return false;
      const first = new Date(blocks[0]!.timestamp).getTime();
      const last  = new Date(blocks[blocks.length - 1]!.timestamp).getTime();
      return (last - first) < 5 * 60 * 1000; // 5 minutes
    }
  },

  // Rule 5: Tool abuse + exfiltration — tool exploitation
  {
    id: 'CORR005',
    name: 'tool_exfil_chain',
    description: 'Tool exploitation chain: tool blocked + exfiltration event',
    check: (events) => {
      const toolBlocked = events.some(e =>
        e.source === 'clawguard' && e.category === 'tool_abuse' && e.severity === 'block'
      );
      const exfilAttempt = events.some(e =>
        e.category === 'exfiltration'
      );
      return toolBlocked && exfilAttempt;
    }
  },

  // Rule 6: Supply chain tamper detected post-install
  {
    id: 'CORR006',
    name: 'supply_chain_tamper',
    description: 'Post-install skill tampering: skill modified after hash was recorded',
    check: (events) => events.some(e =>
      e.source === 'clawhub-scanner' && e.description.toLowerCase().includes('tamper')
    )
  },

  // Rule 7: Rapid event burst — automated attack tooling
  {
    id: 'CORR007',
    name: 'rapid_attack_burst',
    description: 'Rapid attack burst: 10+ security events within 60 seconds (possible automated tooling)',
    check: (events) => {
      const nonInfo = events.filter(e => e.severity !== 'info');
      if (nonInfo.length < 10) return false;
      const sorted = nonInfo.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      // Sliding window of 60 seconds
      for (let i = 0; i < sorted.length - 9; i++) {
        const windowStart = new Date(sorted[i]!.timestamp).getTime();
        const windowEnd   = new Date(sorted[i + 9]!.timestamp).getTime();
        if (windowEnd - windowStart < 60_000) return true;
      }
      return false;
    }
  }
];

export class CorrelationEngine {
  private db: Database.Database;
  private lastRunAt: number = 0;
  private readonly runIntervalMs = 60_000; // Run at most once per minute

  constructor() {
    this.db = new Database(DB_PATH, { readonly: false, fileMustExist: false });
    this.db.pragma('journal_mode = WAL');
    // Ensure events table exists (core package creates it, but graceful fallback)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id          TEXT PRIMARY KEY,
        timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
        source      TEXT NOT NULL,
        severity    TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'system',
        description TEXT NOT NULL,
        payload     TEXT NOT NULL DEFAULT '{}',
        session_id  TEXT
      );
    `);
  }

  // Evaluate all rules against events in the correlation window
  evaluate(): CorrelationAlert[] {
    const now = Date.now();
    if (now - this.lastRunAt < this.runIntervalMs) return [];
    this.lastRunAt = now;

    const windowStart = new Date(now - CORRELATION_WINDOW_MS).toISOString();
    const events = this.db.prepare(
      `SELECT * FROM events WHERE timestamp >= ? ORDER BY timestamp ASC`
    ).all(windowStart) as EventRow[];

    if (events.length === 0) return [];

    const alerts: CorrelationAlert[] = [];

    for (const rule of RULES) {
      try {
        if (rule.check(events)) {
          const alert: CorrelationAlert = {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: 'critical',
            description: rule.description,
            eventCount: events.length,
            windowMs: CORRELATION_WINDOW_MS,
            firedAt: new Date().toISOString()
          };

          // Write correlation alert to the events table for persistence + dashboard feed
          this.persistAlert(alert);
          alerts.push(alert);
        }
      } catch { /* rule error — skip */ }
    }

    return alerts;
  }

  private persistAlert(alert: CorrelationAlert): void {
    const id = `corr-${alert.ruleId}-${Date.now()}`;
    // Avoid duplicate alerts: check if this rule fired in the last 10 minutes
    const recent = this.db.prepare(
      `SELECT id FROM events WHERE source = 'correlation' AND description LIKE ? AND timestamp >= ?`
    ).get(`%${alert.ruleId}%`, new Date(Date.now() - 10 * 60_000).toISOString());

    if (recent) return; // Already alerted recently

    this.db.prepare(`
      INSERT OR IGNORE INTO events (id, source, severity, category, description, payload)
      VALUES (?, 'correlation', 'critical', 'correlation', ?, ?)
    `).run(
      id,
      `[${alert.ruleId}] ${alert.description}`,
      JSON.stringify({ ruleId: alert.ruleId, ruleName: alert.ruleName, eventCount: alert.eventCount })
    );
  }

  getRuleCount(): number { return RULES.length; }
}

// Singleton
let _engine: CorrelationEngine | null = null;
export function getCorrelationEngine(): CorrelationEngine {
  _engine ??= new CorrelationEngine();
  return _engine;
}
