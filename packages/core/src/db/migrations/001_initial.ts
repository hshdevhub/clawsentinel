import Database from 'better-sqlite3';

export const version = 1;
export const description = 'Initial schema — events, skill_scans, skill_hashes, config, module_status';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const already = db.prepare('SELECT version FROM _migrations WHERE version = ?').get(version);
  if (already) return;

  db.prepare('INSERT INTO _migrations (version, description) VALUES (?, ?)').run(version, description);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS module_status;
    DROP TABLE IF EXISTS config;
    DROP TABLE IF EXISTS skill_hashes;
    DROP TABLE IF EXISTS skill_scans;
    DROP TABLE IF EXISTS events;
  `);
}
