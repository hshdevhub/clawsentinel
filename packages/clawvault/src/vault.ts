import Database from 'better-sqlite3';
import { keychain } from './keychain.js';
import { eventBus, moduleLogger } from '@clawsentinel/core';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';

const VAULT_DIR = path.join(os.homedir(), '.clawsentinel', 'vault');
const VAULT_PATH = path.join(VAULT_DIR, 'vault.db');
const VAULT_SERVICE = 'clawsentinel-vault';
const VAULT_ACCOUNT = 'master-key';

const log = moduleLogger('clawvault');

export interface VaultEntry {
  name: string;
  reference: string;
  allowedEndpoints: string[];
  createdAt: string;
}

export class ClawVault {
  private db: Database.Database | null = null;
  private encryptionKey: Buffer | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });

    // Get or generate master key from OS keychain (or AES fallback)
    let masterKey = await keychain.getPassword(VAULT_SERVICE, VAULT_ACCOUNT);
    if (!masterKey) {
      masterKey = crypto.randomBytes(32).toString('hex');
      await keychain.setPassword(VAULT_SERVICE, VAULT_ACCOUNT, masterKey);
      log.info('ClawVault master key generated', {
        storage: keychain.isNative ? 'OS keychain' : 'encrypted file (fallback)'
      });
    }

    this.encryptionKey = Buffer.from(masterKey, 'hex');

    this.db = new Database(VAULT_PATH, { fileMustExist: false });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_entries (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        name             TEXT UNIQUE NOT NULL,
        encrypted_value  TEXT NOT NULL,
        allowed_endpoints TEXT NOT NULL DEFAULT '[]',
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.initialized = true;
    log.info('ClawVault initialized', { path: VAULT_PATH });
  }

  private assertReady(): void {
    if (!this.initialized || !this.db || !this.encryptionKey) {
      throw new Error('ClawVault not initialized — call vault.init() first');
    }
  }

  // Store a credential encrypted in the vault
  set(name: string, value: string, allowedEndpoints: string[]): void {
    this.assertReady();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey!, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const stored = JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      authTag: authTag.toString('hex')
    });

    const existing = !!this.db!.prepare('SELECT id FROM vault_entries WHERE name = ?').get(name);

    this.db!.prepare(`
      INSERT OR REPLACE INTO vault_entries (name, encrypted_value, allowed_endpoints)
      VALUES (?, ?, ?)
    `).run(name, stored, JSON.stringify(allowedEndpoints));

    log.info(`Credential stored: ${name}`, {
      allowedEndpoints,
      overwritten: existing
    });
  }

  // Resolve a vault reference (@vault:name) for a specific target endpoint
  // Returns the plaintext credential ONLY if targetEndpoint is in the allowlist
  resolve(reference: string, targetEndpoint: string): string | null {
    // Not a vault reference — return as-is (passthrough)
    if (!reference.startsWith('@vault:')) return reference;

    this.assertReady();

    const name = reference.slice('@vault:'.length);
    const row = this.db!.prepare(
      'SELECT * FROM vault_entries WHERE name = ?'
    ).get(name) as { encrypted_value: string; allowed_endpoints: string } | undefined;

    if (!row) {
      log.warn(`Vault reference not found: ${name}`);
      return null;
    }

    // Endpoint allowlist check — CRITICAL security gate
    // A compromised skill cannot receive a credential for an endpoint not in the allowlist
    const allowed: string[] = JSON.parse(row.allowed_endpoints) as string[];
    const isAllowed = allowed.some(ep => targetEndpoint.startsWith(ep));

    if (!isAllowed) {
      log.warn(`Credential denied: "${name}" requested by non-allowlisted endpoint`, {
        targetEndpoint,
        allowedEndpoints: allowed
      });

      eventBus.emit('vault:denied', {
        source: 'clawvault',
        severity: 'warn',
        category: 'credential',
        description: `Credential "${name}" denied — endpoint "${targetEndpoint}" not in allowlist`,
        payload: { name, targetEndpoint, allowedEndpoints: allowed }
      });

      return null;
    }

    // Decrypt and return the credential
    const stored = JSON.parse(row.encrypted_value) as {
      iv: string;
      data: string;
      authTag: string;
    };

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey!,
      Buffer.from(stored.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(stored.authTag, 'hex'));
    return decipher.update(Buffer.from(stored.data, 'hex')) + decipher.final('utf8');
  }

  // Remove a credential from the vault
  delete(name: string): boolean {
    this.assertReady();
    const result = this.db!.prepare('DELETE FROM vault_entries WHERE name = ?').run(name);
    if (result.changes > 0) {
      log.info(`Credential deleted: ${name}`);
      return true;
    }
    return false;
  }

  // List all stored credentials (names + metadata only — never the values)
  list(): VaultEntry[] {
    this.assertReady();
    return (this.db!.prepare(
      'SELECT name, allowed_endpoints, created_at FROM vault_entries ORDER BY name'
    ).all() as Array<{ name: string; allowed_endpoints: string; created_at: string }>).map(row => ({
      name: row.name,
      reference: `@vault:${row.name}`,
      allowedEndpoints: JSON.parse(row.allowed_endpoints) as string[],
      createdAt: row.created_at
    }));
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const vault = new ClawVault();
