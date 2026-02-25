// ClawHub Scanner — Skill Hash Verifier
// Records SHA-256 hashes of skill files at install time.
// On every re-scan, compares current hash to stored baseline.
// If hash changed → skill was tampered with post-install.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import os from 'os';
import { moduleLogger } from '@clawsentinel/core';

const log = moduleLogger('clawhub-scanner:hash-verifier');

const DB_DIR  = path.join(os.homedir(), '.clawsentinel');
const DB_PATH = path.join(DB_DIR, 'clawsentinel.db');

interface HashRow {
  skill_id: string;
  file_path: string;
  hash: string;
  recorded_at: string;
}

export interface VerifyResult {
  skillId: string;
  filePath: string;
  status: 'clean' | 'tampered' | 'new' | 'missing';
  currentHash: string | null;
  storedHash: string | null;
}

export class HashVerifier {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_hashes (
        skill_id    TEXT NOT NULL,
        file_path   TEXT NOT NULL,
        hash        TEXT NOT NULL,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (skill_id, file_path)
      );
    `);
  }

  // Record the hash of a skill file at install time
  record(skillId: string, filePath: string): string {
    const hash = this.hashFile(filePath);
    this.db.prepare(`
      INSERT OR REPLACE INTO skill_hashes (skill_id, file_path, hash)
      VALUES (?, ?, ?)
    `).run(skillId, filePath, hash);

    log.info(`Hash recorded for skill "${skillId}"`, { filePath, hash: hash.slice(0, 16) + '…' });
    return hash;
  }

  // Verify a skill file against its stored hash
  verify(skillId: string, filePath: string): VerifyResult {
    const row = this.db.prepare(
      'SELECT * FROM skill_hashes WHERE skill_id = ? AND file_path = ?'
    ).get(skillId, filePath) as HashRow | undefined;

    if (!fs.existsSync(filePath)) {
      return { skillId, filePath, status: 'missing', currentHash: null, storedHash: row?.hash ?? null };
    }

    const currentHash = this.hashFile(filePath);

    if (!row) {
      return { skillId, filePath, status: 'new', currentHash, storedHash: null };
    }

    const status = currentHash === row.hash ? 'clean' : 'tampered';

    if (status === 'tampered') {
      log.warn(`Skill tampered: "${skillId}" — hash mismatch`, {
        filePath,
        stored: row.hash.slice(0, 16) + '…',
        current: currentHash.slice(0, 16) + '…'
      });
    }

    return { skillId, filePath, status, currentHash, storedHash: row.hash };
  }

  // Verify all files for a skill
  verifyAll(skillId: string): VerifyResult[] {
    const rows = this.db.prepare(
      'SELECT * FROM skill_hashes WHERE skill_id = ?'
    ).all(skillId) as HashRow[];

    return rows.map(row => this.verify(skillId, row.file_path));
  }

  // Remove hash records for a skill (on uninstall)
  clear(skillId: string): void {
    this.db.prepare('DELETE FROM skill_hashes WHERE skill_id = ?').run(skillId);
    log.info(`Hash records cleared for skill "${skillId}"`);
  }

  // List all tracked skills
  listTracked(): Array<{ skillId: string; fileCount: number; recordedAt: string }> {
    const rows = this.db.prepare(`
      SELECT skill_id, COUNT(*) as file_count, MAX(recorded_at) as last_recorded
      FROM skill_hashes
      GROUP BY skill_id
      ORDER BY last_recorded DESC
    `).all() as Array<{ skill_id: string; file_count: number; last_recorded: string }>;

    return rows.map(r => ({
      skillId: r.skill_id,
      fileCount: r.file_count,
      recordedAt: r.last_recorded
    }));
  }

  private hashFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

export const hashVerifier = new HashVerifier();
