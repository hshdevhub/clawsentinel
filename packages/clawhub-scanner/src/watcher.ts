// ClawHub Scanner — Continuous Skill Watcher
// Monitors the OpenClaw skills directory for:
//   1. New skill installs  → scan immediately
//   2. Post-install changes → verify hash, re-scan, alert if tampered

import fs from 'fs';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';
import { moduleLogger, eventBus, getDb } from '@clawsentinel/core';
import { skillScanner } from './scanner.js';
import { hashVerifier } from './hash-verifier.js';

const log = moduleLogger('clawhub-scanner:watcher');

// Default OpenClaw skills directory — can be overridden via env
const OPENCLAW_SKILLS_DIR = process.env['OPENCLAW_SKILLS_DIR']
  ?? path.join(os.homedir(), '.openclaw', 'skills');

const SCAN_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.json']);
const DEBOUNCE_MS = 500; // Debounce file change events

export interface WatcherStats {
  watching: boolean;
  skillsDir: string;
  skillsTracked: number;
  lastEventAt: string | null;
}

export class SkillWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stats: WatcherStats = {
    watching: false,
    skillsDir: OPENCLAW_SKILLS_DIR,
    skillsTracked: 0,
    lastEventAt: null
  };

  start(): void {
    if (this.watcher) {
      log.warn('Watcher already running');
      return;
    }

    if (!fs.existsSync(OPENCLAW_SKILLS_DIR)) {
      log.info(`Skills directory not found — watcher will activate when it appears`, {
        dir: OPENCLAW_SKILLS_DIR
      });
    }

    this.watcher = chokidar.watch(OPENCLAW_SKILLS_DIR, {
      persistent: true,
      ignoreInitial: false,         // Scan existing skills on startup
      depth: 3,                     // Skill directories can have nested files
      awaitWriteFinish: {
        stabilityThreshold: 300,    // Wait 300ms after last write
        pollInterval: 100
      },
      ignored: [
        /node_modules/,
        /\.git/,
        /dist\//,
        /\.map$/
      ]
    });

    this.watcher
      .on('add', (filePath) => this.handleFile(filePath, 'add'))
      .on('change', (filePath) => this.handleFile(filePath, 'change'))
      .on('unlink', (filePath) => this.handleRemove(filePath))
      .on('error', (err) => log.error('Watcher error', { error: String(err) }))
      .on('ready', () => {
        this.stats.watching = true;
        log.info('ClawHub Scanner watching for skill changes', { dir: OPENCLAW_SKILLS_DIR });
      });
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
      this.stats.watching = false;
      log.info('SkillWatcher stopped');
    }
  }

  getStats(): WatcherStats {
    return {
      ...this.stats,
      skillsTracked: hashVerifier.listTracked().length
    };
  }

  private handleFile(filePath: string, event: 'add' | 'change'): void {
    const ext = path.extname(filePath);
    if (!SCAN_EXTENSIONS.has(ext)) return;

    this.stats.lastEventAt = new Date().toISOString();

    // Debounce — editors write files in multiple flushes
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.processFile(filePath, event);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  private processFile(filePath: string, event: 'add' | 'change'): void {
    const skillId = this.extractSkillId(filePath);
    if (!skillId) return;

    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      log.warn('Cannot read skill file', { filePath, error: String(err) });
      return;
    }

    if (event === 'change') {
      // Verify hash — detect post-install tampering
      const verifyResult = hashVerifier.verify(skillId, filePath);
      if (verifyResult.status === 'tampered') {
        eventBus.emit('clawhub:tamper-detected', {
          source: 'clawhub-scanner',
          severity: 'critical',
          category: 'supply_chain',
          description: `Skill "${skillId}" was modified after install — possible supply chain attack`,
          payload: {
            skillId,
            filePath,
            storedHash: verifyResult.storedHash?.slice(0, 16),
            currentHash: verifyResult.currentHash?.slice(0, 16)
          }
        });
      }
    }

    // Run static analysis
    const result = skillScanner.scan(skillId, source, {
      source: event === 'add' ? 'watcher' : 'watcher'
    });

    // Record/update hash after clean scan
    if (result.verdict !== 'block') {
      try {
        hashVerifier.record(skillId, filePath);
      } catch (err) {
        log.warn('Failed to record hash', { skillId, error: String(err) });
      }
    }

    // Persist scan result to skill_scans table (queried by ClawEye + Chrome extension)
    try {
      const db = getDb();
      db.prepare(`INSERT INTO skill_scans (skill_id, score, verdict, findings, source)
                  VALUES (?, ?, ?, ?, ?)`)
        .run(
          skillId,
          result.score,
          result.verdict,
          JSON.stringify(result.findings),
          result.source ?? 'watcher'
        );
    } catch (err) {
      log.warn('Failed to persist scan result', { skillId, error: String(err) });
    }

    // Emit events based on verdict
    if (result.verdict === 'block') {
      eventBus.emit('clawhub:skill-blocked', {
        source: 'clawhub-scanner',
        severity: 'block',
        category: 'supply_chain',
        description: `Malicious skill detected: "${skillId}" (score ${result.score}/100)`,
        payload: {
          skillId,
          score: result.score,
          findings: result.findings.map(f => ({ id: f.id, description: f.description }))
        }
      });
    } else if (result.verdict === 'warn') {
      eventBus.emit('clawhub:skill-warn', {
        source: 'clawhub-scanner',
        severity: 'warn',
        category: 'supply_chain',
        description: `Suspicious skill: "${skillId}" (score ${result.score}/100)`,
        payload: {
          skillId,
          score: result.score,
          categories: result.categories
        }
      });
    }
  }

  private handleRemove(filePath: string): void {
    const skillId = this.extractSkillId(filePath);
    if (skillId) {
      log.info(`Skill file removed: ${skillId}`, { filePath });
    }
  }

  // Extract skill ID from path: ~/.openclaw/skills/<skill-id>/index.js → skill-id
  private extractSkillId(filePath: string): string | null {
    const relative = path.relative(OPENCLAW_SKILLS_DIR, filePath);
    const parts = relative.split(path.sep);
    return parts[0] ?? null;
  }
}

export const skillWatcher = new SkillWatcher();
