import Database from 'better-sqlite3';

export function applySchema(db: Database.Database): void {
  db.exec(`
    -- Core security event log (all modules write here)
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL,
      source      TEXT NOT NULL CHECK(source IN ('clawguard','clawhub','clawvault','clawbox','system')),
      severity    TEXT NOT NULL CHECK(severity IN ('info','warn','block','critical')),
      category    TEXT NOT NULL CHECK(category IN ('injection','supply_chain','credential','tool_abuse','infrastructure','correlation','system')),
      description TEXT NOT NULL,
      session_id  TEXT,
      payload     TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_events_session    ON events(session_id) WHERE session_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_severity   ON events(severity);
    CREATE INDEX IF NOT EXISTS idx_events_source     ON events(source);

    -- Skill scan results (ClawHub Scanner writes here; queried by ClawEye + Chrome extension)
    CREATE TABLE IF NOT EXISTS skill_scans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id   TEXT NOT NULL,
      score      INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
      verdict    TEXT NOT NULL DEFAULT 'warn' CHECK(verdict IN ('safe','warn','block')),
      findings   TEXT NOT NULL DEFAULT '[]',
      source     TEXT NOT NULL DEFAULT 'watcher',
      scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_skill_scans_id   ON skill_scans(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_scans_time ON skill_scans(scanned_at DESC);

    -- Skill file hashes for tamper detection (ClawHub Scanner)
    CREATE TABLE IF NOT EXISTS skill_hashes (
      skill_name    TEXT PRIMARY KEY,
      file_path     TEXT NOT NULL,
      hash          TEXT NOT NULL,
      algorithm     TEXT NOT NULL DEFAULT 'sha256',
      last_verified TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ClawSentinel configuration (key-value store)
    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Module health status
    CREATE TABLE IF NOT EXISTS module_status (
      name          TEXT PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'stopped',
      version       TEXT NOT NULL DEFAULT '',
      started_at    TEXT,
      last_event_at TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      error_message TEXT,
      stats         TEXT NOT NULL DEFAULT '{}'
    );
  `);
}
