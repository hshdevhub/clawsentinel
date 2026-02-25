import { Command } from 'commander';
import { getDb } from '@clawsentinel/core';

export function logsCommand(): Command {
  return new Command('logs')
    .description('View ClawSentinel audit log')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output in real time')
    .option('-s, --severity <level>', 'Filter by severity (info|warn|block|critical)')
    .option('--source <module>', 'Filter by module (clawguard|clawhub|clawvault|clawbox|system)')
    .action((options: { lines?: string; follow?: boolean; severity?: string; source?: string }) => {
      const limit = parseInt(options.lines ?? '50', 10);

      try {
        const db = getDb();
        let query = 'SELECT * FROM events';
        const conditions: string[] = [];
        const params: string[] = [];

        if (options.severity) {
          conditions.push('severity = ?');
          params.push(options.severity);
        }
        if (options.source) {
          conditions.push('source = ?');
          params.push(options.source);
        }

        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(String(limit));

        type EventRow = { timestamp: string; severity: string; source: string; description: string };
        const rows = db.prepare(query).all(...params) as EventRow[];

        if (rows.length === 0) {
          console.log('[ClawSentinel] No events in audit log yet.');
          console.log('  Start ClawSentinel and events will appear here.');
          return;
        }

        const severityColor: Record<string, string> = {
          info: '\x1b[37m',
          warn: '\x1b[33m',
          block: '\x1b[91m',
          critical: '\x1b[31m'
        };
        const reset = '\x1b[0m';

        for (const row of [...rows].reverse()) {
          const color = severityColor[row.severity] ?? '';
          const ts = new Date(row.timestamp).toLocaleTimeString();
          console.log(`${color}${ts} [${row.source}] ${row.severity.toUpperCase().padEnd(8)} ${row.description}${reset}`);
        }

        if (options.follow) {
          console.log('\n  --follow mode: polling every 2s (Ctrl+C to stop)');
          let lastTimestamp = rows[0]?.timestamp ?? '';

          setInterval(() => {
            const newRows = db.prepare(
              'SELECT * FROM events WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 100'
            ).all(lastTimestamp) as EventRow[];

            for (const row of newRows) {
              const color = severityColor[row.severity] ?? '';
              const ts = new Date(row.timestamp).toLocaleTimeString();
              console.log(`${color}${ts} [${row.source}] ${row.severity.toUpperCase().padEnd(8)} ${row.description}${reset}`);
              lastTimestamp = row.timestamp;
            }
          }, 2000);
        }
      } catch {
        console.log('[ClawSentinel] Audit log not yet initialized. Run: clawsentinel init');
      }
    });
}
