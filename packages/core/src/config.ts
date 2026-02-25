import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClawSentinelConfigSchema, type ClawSentinelConfig } from './types/config.js';

const CONFIG_DIR = path.join(os.homedir(), '.clawsentinel');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

class ConfigManager {
  private _config: ClawSentinelConfig | null = null;

  load(): ClawSentinelConfig {
    if (this._config) return this._config;

    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    if (!fs.existsSync(CONFIG_PATH)) {
      // First run — write defaults
      this._config = ClawSentinelConfigSchema.parse({});
      this.save();
      return this._config;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as unknown;
      this._config = ClawSentinelConfigSchema.parse(raw);
    } catch {
      // Corrupt config — reset to defaults
      this._config = ClawSentinelConfigSchema.parse({});
      this.save();
    }

    return this._config;
  }

  get<K extends keyof ClawSentinelConfig>(key: K): ClawSentinelConfig[K] {
    return this.load()[key];
  }

  set<K extends keyof ClawSentinelConfig>(key: K, value: ClawSentinelConfig[K]): void {
    const config = this.load();
    (config as Record<string, unknown>)[key as string] = value;
    this._config = ClawSentinelConfigSchema.parse(config);
    this.save();
  }

  setNested(dotPath: string, value: unknown): void {
    const config = this.load() as Record<string, unknown>;
    const parts = dotPath.split('.');
    let cursor = config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] as string;
      if (typeof cursor[part] !== 'object' || cursor[part] === null) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1] as string] = value;
    this._config = ClawSentinelConfigSchema.parse(config);
    this.save();
  }

  private save(): void {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this._config, null, 2), 'utf8');
  }

  reload(): void {
    this._config = null;
    this.load();
  }
}

export const config = new ConfigManager();
