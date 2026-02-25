import fs from 'fs';
import path from 'path';
import os from 'os';
import { vault } from './vault.js';
import { moduleLogger } from '@clawsentinel/core';

const log = moduleLogger('clawvault:migrator');

// All known locations where OpenClaw stores API keys
// Checked in priority order — first match wins
const KEY_SOURCES = [
  {
    label: 'OpenClaw config (~/.openclaw/config.json)',
    resolve: () => readJsonKey(
      path.join(os.homedir(), '.openclaw', 'config.json'),
      ['anthropicKey', 'anthropic_key', 'apiKey', 'ANTHROPIC_API_KEY']
    )
  },
  {
    label: 'OpenClaw macOS config',
    resolve: () => readJsonKey(
      path.join(os.homedir(), 'Library', 'Application Support', 'openclaw', 'config.json'),
      ['anthropicKey', 'anthropic_key', 'apiKey']
    )
  },
  {
    label: 'OpenClaw .env file (~/.openclaw/.env)',
    resolve: () => readEnvFile(
      path.join(os.homedir(), '.openclaw', '.env'),
      ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']
    )
  },
  {
    label: 'Shell environment (ANTHROPIC_API_KEY)',
    resolve: () => process.env['ANTHROPIC_API_KEY'] ?? null
  },
  {
    label: 'Shell environment (OPENAI_API_KEY)',
    resolve: () => process.env['OPENAI_API_KEY'] ?? null
  },
  {
    label: 'OpenClaw config — OpenAI key',
    resolve: () => readJsonKey(
      path.join(os.homedir(), '.openclaw', 'config.json'),
      ['openaiKey', 'openai_key', 'OPENAI_API_KEY']
    )
  },
  {
    label: 'Shell environment (GOOGLE_AI_API_KEY)',
    resolve: () => process.env['GOOGLE_AI_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? null
  }
];

export interface DetectionResult {
  anthropic: boolean;
  openai: boolean;
  gemini: boolean;
  ollama: boolean;
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'none';
}

// Auto-detect and store all API keys from OpenClaw config — zero user input required
export async function autoDetectAndStoreKeys(): Promise<DetectionResult> {
  log.info('Scanning for API keys from OpenClaw installation...');

  await vault.init();

  let anthropicFound = false;
  let openaiFound = false;
  let geminiFound = false;

  for (const source of KEY_SOURCES) {
    const value = source.resolve();
    if (!value || typeof value !== 'string') continue;

    if (value.startsWith('sk-ant-') && !anthropicFound) {
      vault.set('anthropic', value, ['https://api.anthropic.com']);
      log.info(`Anthropic key found → stored in ClawVault`, { source: source.label });
      anthropicFound = true;
    }

    if (value.startsWith('sk-') && !value.startsWith('sk-ant-') && !openaiFound) {
      vault.set('openai', value, ['https://api.openai.com']);
      log.info(`OpenAI key found → stored in ClawVault`, { source: source.label });
      openaiFound = true;
    }

    if ((value.startsWith('AIza') || value.startsWith('gai_')) && !geminiFound) {
      vault.set('gemini', value, ['https://generativelanguage.googleapis.com']);
      log.info(`Gemini key found → stored in ClawVault`, { source: source.label });
      geminiFound = true;
    }

    // Stop if we found all three
    if (anthropicFound && openaiFound && geminiFound) break;
  }

  // Detect Ollama (local model server — free, no key needed)
  const ollamaRunning = await checkOllamaRunning();
  if (ollamaRunning) {
    log.info('Ollama detected at localhost:11434 → available as semantic engine fallback');
  }

  const provider = anthropicFound ? 'anthropic'
    : openaiFound ? 'openai'
      : geminiFound ? 'gemini'
        : ollamaRunning ? 'ollama'
          : 'none';

  return {
    anthropic: anthropicFound,
    openai: openaiFound,
    gemini: geminiFound,
    ollama: ollamaRunning,
    provider
  };
}

// Migrate plaintext keys from existing OpenClaw config to vault references
// Original config is backed up before modification
export async function migrateConfigToVaultRefs(configPath: string): Promise<boolean> {
  if (!fs.existsSync(configPath)) return false;

  const backupPath = `${configPath}.bak.${Date.now()}`;
  fs.copyFileSync(configPath, backupPath);
  log.info('Config backed up', { backupPath });

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    log.error('Cannot parse config file — skipping migration');
    return false;
  }

  const keyFields = ['anthropicKey', 'anthropic_key', 'apiKey', 'openaiKey', 'openai_key'];
  let modified = false;

  for (const field of keyFields) {
    const value = config[field];
    if (typeof value !== 'string') continue;

    if (value.startsWith('sk-ant-')) {
      config[field] = '@vault:anthropic';
      modified = true;
    } else if (value.startsWith('sk-') && !value.startsWith('sk-ant-')) {
      config[field] = '@vault:openai';
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    log.info('Config migrated to vault references', { configPath });
  }

  return modified;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJsonKey(filePath: string, keyNames: string[]): string | null {
  if (!fs.existsSync(filePath)) return null;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  for (const key of keyNames) {
    if (typeof config[key] === 'string') return config[key] as string;

    // Check one level deep (e.g., config.llm.anthropicKey)
    for (const section of Object.values(config)) {
      if (typeof section === 'object' && section !== null) {
        const nested = (section as Record<string, unknown>)[key];
        if (typeof nested === 'string') return nested;
      }
    }
  }

  return null;
}

function readEnvFile(filePath: string, varNames: string[]): string | null {
  if (!fs.existsSync(filePath)) return null;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    for (const varName of varNames) {
      const match = line.match(new RegExp(`^${varName}=["']?([^"'\\n]+)["']?`));
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

async function checkOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(1000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
