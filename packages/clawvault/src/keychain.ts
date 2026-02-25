import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Attempt to load keytar (native OS keychain module)
// Gracefully degrades to file-based AES-256-GCM if unavailable (headless Linux)
type Keytar = typeof import('keytar');
let keytarModule: Keytar | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  keytarModule = require('keytar') as Keytar;
} catch {
  // keytar not available — will use file-based fallback
}

// File-based fallback: AES-256-GCM with a machine-derived key
// Used on headless Linux servers where no keychain daemon is available
const FALLBACK_DIR = path.join(os.homedir(), '.clawsentinel', 'keychain');
const MACHINE_KEY_PATH = path.join(FALLBACK_DIR, '.mk');

function getMachineKey(): Buffer {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true, mode: 0o700 });

  if (fs.existsSync(MACHINE_KEY_PATH)) {
    return Buffer.from(fs.readFileSync(MACHINE_KEY_PATH, 'utf8'), 'hex');
  }

  // Generate a new 32-byte machine key on first run
  const key = crypto.randomBytes(32);
  fs.writeFileSync(MACHINE_KEY_PATH, key.toString('hex'), { mode: 0o600 });
  return key;
}

function keychainFilePath(service: string, account: string): string {
  const safe = `${service}__${account}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(FALLBACK_DIR, `${safe}.enc`);
}

const fileBasedKeychain = {
  get(service: string, account: string): string | null {
    const fp = keychainFilePath(service, account);
    if (!fs.existsSync(fp)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8')) as {
        iv: string;
        data: string;
        authTag: string;
      };
      const key = getMachineKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(raw.authTag, 'hex'));
      return decipher.update(Buffer.from(raw.data, 'hex')) + decipher.final('utf8');
    } catch {
      return null;
    }
  },

  set(service: string, account: string, password: string): void {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true, mode: 0o700 });
    const key = getMachineKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const stored = JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      authTag: authTag.toString('hex')
    });

    fs.writeFileSync(keychainFilePath(service, account), stored, { mode: 0o600 });
  },

  delete(service: string, account: string): boolean {
    const fp = keychainFilePath(service, account);
    if (!fs.existsSync(fp)) return false;
    fs.unlinkSync(fp);
    return true;
  }
};

export const keychain = {
  isNative: keytarModule !== null,

  async getPassword(service: string, account: string): Promise<string | null> {
    if (keytarModule) {
      return keytarModule.getPassword(service, account);
    }
    return fileBasedKeychain.get(service, account);
  },

  async setPassword(service: string, account: string, password: string): Promise<void> {
    if (keytarModule) {
      return keytarModule.setPassword(service, account, password);
    }
    fileBasedKeychain.set(service, account, password);
  },

  async deletePassword(service: string, account: string): Promise<boolean> {
    if (keytarModule) {
      return keytarModule.deletePassword(service, account);
    }
    return fileBasedKeychain.delete(service, account);
  }
};
