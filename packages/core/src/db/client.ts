import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { applySchema } from './schema.js';

const DB_DIR = path.join(os.homedir(), '.clawsentinel');
const DB_PATH = path.join(DB_DIR, 'clawsentinel.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH, {
    verbose: process.env['NODE_ENV'] === 'development'
      ? (msg) => process.stdout.write(`[SQLite] ${msg}\n`)
      : undefined
  });

  // WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');

  applySchema(_db);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export const db = {
  get instance(): Database.Database {
    return getDb();
  }
};
