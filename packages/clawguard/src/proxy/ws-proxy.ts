import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { parseFrame } from './frame-parser.js';
import { taintTracker } from '../engines/taint-tracker.js';
import { patternEngine } from '../engines/pattern-engine.js';
import { semanticEngine } from '../engines/semantic-engine.js';
import { riskScorer } from '../engines/risk-scorer.js';
import { eventBus, moduleLogger, config, isPro } from '@clawsentinel/core';
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

  // ── Semantic engine — passthrough-first guarantee ──────────────────────────
  // If pattern score already exceeds block threshold → block immediately without LLM latency.
  // If pattern score is in the warn range (semanticGate < score < blockThreshold) → pass the
  // message through now and fire the LLM check async. If semantic analysis confirms an attack,
  // we emit a retroactive alert event so ClawEye surfaces it.
  // This ensures OpenClaw latency is never increased by LLM round-trips.
  const riskContext = {
    isTainted: taint.isTainted,
    taintRiskLevel: taint.riskLevel,
    frameType: frame.type,
    contentLength: frame.content.length
  };

  if (patternResult.score >= cfg.blockThreshold) {
    // Block synchronously — pattern alone is decisive, no LLM needed
    const risk = riskScorer.compute(patternResult, null, riskContext);

    // Monitor mode: alert but never block
    const mode = config.load().clawguard.mode;
    if (mode === 'monitor') {
      log.warn('MONITOR MODE — would have blocked (passing through)', { score: risk.score, sessionId });
      return { action: 'warn', score: risk.score, reason: `[monitor] ${risk.reason}` };
    }

    return { action: risk.action, score: risk.score, reason: risk.reason };
  }

  if (patternResult.score > cfg.semanticScoreGate) {
    // Pattern score is in the suspicious-but-not-decisive range.
    // Pass through immediately and verify asynchronously.
    const risk = riskScorer.compute(patternResult, null, riskContext);

    // Fire-and-forget LLM check — Pro plan only
    // Free plan users get pattern-only protection (still catches all known attack signatures)
    if (isPro()) {
      setImmediate(() => {
        semanticEngine.analyze(frame.content).then(semanticResult => {
          const asyncRisk = riskScorer.compute(patternResult, semanticResult, riskContext);
          if (asyncRisk.action === 'block' && semanticResult.isInjection) {
            eventBus.emit('clawguard:semantic-confirm', {
              source: 'clawguard',
              severity: 'critical',
              category: 'injection',
              description: `Semantic engine confirmed injection (post-pass): ${semanticResult.reason}`,
              sessionId,
              payload: {
                score: asyncRisk.score,
                provider: semanticResult.provider,
                confidence: semanticResult.confidence,
                contentHash: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
              }
            });
          }
        }).catch(() => { /* semantic failure — non-fatal, already passed through */ });
      });
    }

    // Monitor mode: already warn-or-pass, honour it
    const mode = config.load().clawguard.mode;
    if (mode === 'monitor' && risk.action === 'block') {
      return { action: 'warn', score: risk.score, reason: `[monitor] ${risk.reason}` };
    }

    return { action: risk.action, score: risk.score, reason: risk.reason };
  }

  // Below semantic gate — pure pattern result
  const risk = riskScorer.compute(patternResult, null, riskContext);

  const mode = config.load().clawguard.mode;
  if (mode === 'monitor' && risk.action === 'block') {
    return { action: 'warn', score: risk.score, reason: `[monitor] ${risk.reason}` };
  }

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
