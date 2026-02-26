import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { getDb } from './db/client.js';
import type { ClawSentinelEvent, PartialEvent } from './types/events.js';

class ClawSentinelEventBus extends EventEmitter {
  private persistEnabled = true;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  override emit(eventName: string, data: PartialEvent): boolean {
    const fullEvent: ClawSentinelEvent = {
      id: data.id ?? randomUUID(),
      timestamp: data.timestamp ?? new Date().toISOString(),
      source: data.source,
      severity: data.severity,
      category: data.category,
      description: data.description,
      sessionId: data.sessionId,
      payload: data.payload ?? {}
    };

    // Persist to SQLite — non-blocking via setImmediate
    if (this.persistEnabled) {
      setImmediate(() => {
        try {
          const db = getDb();
          db.prepare(`
            INSERT OR IGNORE INTO events
              (id, timestamp, source, severity, category, description, session_id, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            fullEvent.id,
            fullEvent.timestamp,
            fullEvent.source,
            fullEvent.severity,
            fullEvent.category,
            fullEvent.description,
            fullEvent.sessionId ?? null,
            JSON.stringify(fullEvent.payload)
          );
        } catch {
          // DB write failure must never crash the security layer
        }
      });
    }

    return super.emit(eventName, fullEvent);
  }

  disablePersistence(): void {
    this.persistEnabled = false;
  }

  enablePersistence(): void {
    this.persistEnabled = true;
  }
}

export const eventBus = new ClawSentinelEventBus();
