import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { parseFrame } from './frame-parser.js';
import { taintTracker } from '../engines/taint-tracker.js';
import { patternEngine } from '../engines/pattern-engine.js';
import { semanticEngine } from '../engines/semantic-engine.js';
import { riskScorer } from '../engines/risk-scorer.js';
import { eventBus, moduleLogger } from '@clawsentinel/core';
import crypto from 'crypto';

const log = moduleLogger('clawguard:ws');

export interface WSProxyConfig {
  listenPort: number;
  upstreamUrl: string;
  blockThreshold: number;
  warnThreshold: number;
  semanticScoreGate: number; // Only invoke LLM if pattern score exceeds this
}

const DEFAULT_CONFIG: WSProxyConfig = {
  listenPort: parseInt(process.env['LISTEN_PORT'] ?? '18790'),
  upstreamUrl: process.env['UPSTREAM_WS'] ?? 'ws://127.0.0.1:18789',
  blockThreshold: 71,
  warnThreshold: 31,
  semanticScoreGate: 30
};

export function startWSProxy(config: Partial<WSProxyConfig> = {}): WebSocketServer {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const wss = new WebSocketServer({ port: cfg.listenPort, host: '127.0.0.1' });

  wss.on('connection', (clientSocket: WebSocket, req: IncomingMessage) => {
    const sessionId = crypto.randomUUID();
    const upstream = new WebSocket(cfg.upstreamUrl);

    upstream.on('open', () => {
      log.info('Session started', { sessionId, ip: req.socket.remoteAddress });

      // ── INBOUND: client → ClawGuard → OpenClaw ────────────────────────────
      clientSocket.on('message', async (data: Buffer, isBinary: boolean) => {
        const raw = data.toString();

        try {
          const inspectResult = await inspectInbound(raw, sessionId, cfg);

          if (inspectResult.action === 'block') {
            clientSocket.send(JSON.stringify({
              type: 'clawsentinel:blocked',
              reason: inspectResult.reason,
              score: inspectResult.score,
              sessionId
            }));

            eventBus.emit('clawguard:block', {
              source: 'clawguard',
              severity: 'block',
              category: 'injection',
              description: `Blocked: ${inspectResult.reason}`,
              sessionId,
              payload: {
                score: inspectResult.score,
                reason: inspectResult.reason,
                contentHash: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
              }
            });
            return;
          }

          if (inspectResult.action === 'warn') {
            eventBus.emit('clawguard:warn', {
              source: 'clawguard',
              severity: 'warn',
              category: 'injection',
              description: `Suspicious content (score ${inspectResult.score}): passing through`,
              sessionId,
              payload: { score: inspectResult.score }
            });
          }

          // PASS — forward to upstream OpenClaw
          upstream.send(data, { binary: isBinary });

        } catch (err) {
          // CRITICAL: If inspection fails, pass through to avoid breaking the agent
          // This is the passthrough-first guarantee
          upstream.send(data, { binary: isBinary });
          log.error('Inspection error — passing through', { error: String(err), sessionId });
        }
      });

      // ── OUTBOUND: OpenClaw → ClawGuard → client (pass-through + log) ──────
      upstream.on('message', (data: Buffer, isBinary: boolean) => {
        setImmediate(() => inspectOutbound(data.toString(), sessionId));
        clientSocket.send(data, { binary: isBinary });
      });
    });

    upstream.on('error', (err) => {
      log.error('Upstream connection error', { error: err.message, sessionId });
      clientSocket.close(1011, 'Upstream connection failed');
    });

    // Bidirectional close/error handling
    clientSocket.on('close', () => { if (upstream.readyState !== WebSocket.CLOSED) upstream.close(); });
    upstream.on('close', () => { if (clientSocket.readyState !== WebSocket.CLOSED) clientSocket.close(); });
    clientSocket.on('error', () => upstream.terminate());
  });

  wss.on('listening', () => {
    log.info(`ClawGuard WS proxy listening`, {
      proxy: `:${cfg.listenPort}`,
      upstream: cfg.upstreamUrl,
      rules: patternEngine.getRuleCount()
    });
  });

  return wss;
}

async function inspectInbound(
  raw: string,
  sessionId: string,
  cfg: WSProxyConfig
): Promise<{ action: 'pass' | 'warn' | 'block'; score: number; reason: string }> {
  const frame = parseFrame(raw);
  const taint = taintTracker.classify(frame.source, frame.type, sessionId);

  // Fast path: internal content from trusted source with no taint
  if (!taint.isTainted && taint.riskLevel === 'none') {
    return { action: 'pass', score: 0, reason: 'Trusted internal content' };
  }

  // Pattern engine — synchronous, fast (<5ms)
  const patternResult = patternEngine.scan(frame.content);

  // Semantic engine — async, only triggered above score gate to control LLM cost
  let semanticResult = null;
  if (patternResult.score > cfg.semanticScoreGate) {
    semanticResult = await semanticEngine.analyze(frame.content);
  }

  const risk = riskScorer.compute(patternResult, semanticResult, {
    isTainted: taint.isTainted,
    taintRiskLevel: taint.riskLevel,
    frameType: frame.type,
    contentLength: frame.content.length
  });

  return { action: risk.action, score: risk.score, reason: risk.reason };
}

function inspectOutbound(raw: string, sessionId: string): void {
  // Outbound inspection: look for raw API keys in responses (T7 — key exfiltration)
  const keyPatterns = [
    /sk-ant-[a-zA-Z0-9-]{20,}/g,
    /sk-[a-zA-Z0-9]{48}/g,
    /AIza[a-zA-Z0-9-_]{35}/g
  ];

  for (const pattern of keyPatterns) {
    if (pattern.test(raw)) {
      eventBus.emit('clawguard:key-in-response', {
        source: 'clawguard',
        severity: 'critical',
        category: 'credential',
        description: 'Raw API key detected in OpenClaw outbound response — possible T7 exfiltration',
        sessionId,
        payload: { direction: 'outbound' }
      });
      break;
    }
  }
}
