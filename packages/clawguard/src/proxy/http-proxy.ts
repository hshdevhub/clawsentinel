import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { resolveVaultRefs, detectRawKeys } from '@clawsentinel/clawvault';
import { patternEngine } from '../engines/pattern-engine.js';
import { eventBus, moduleLogger, config } from '@clawsentinel/core';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const toolBlocklist = require('../rules/tool-blocklist.json') as ToolBlocklist;
const domainAllowlist = require('../rules/domain-allowlist.json') as DomainAllowlist;

const log = moduleLogger('clawguard:http');

interface ToolBlocklist {
  shell_commands: { block: string[]; warn: string[] };
  filesystem_paths: { block: string[]; warn: string[] };
  tool_names: { block: string[]; warn: string[] };
}

interface DomainAllowlist {
  allowed: string[];
  blocked_patterns: string[];
}

// Health endpoint port for Docker healthcheck
const HEALTH_PORT = parseInt(process.env['HEALTH_PORT'] ?? '18791');
const UPSTREAM_HTTP = process.env['UPSTREAM_HTTP'] ?? 'http://127.0.0.1:18789';

export function startHTTPProxy(): http.Server {
  const server = http.createServer();

  // ── Health endpoint (used by Docker + ClawEye status checks) ─────────────
  server.on('request', (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        module: 'clawguard',
        version: '0.7.0',
        rules: patternEngine.getRuleCount(),
        upstreamHttp: UPSTREAM_HTTP
      }));
      return;
    }

    // ── /api/skills/scan-result — Chrome extension badge endpoint ─────────
    // Returns cached scan result for a skill ID (populated by ClawHub Scanner)
    if (req.url?.startsWith('/api/skills/scan-result')) {
      const urlObj = new URL(req.url, `http://localhost`);
      const skillId = urlObj.searchParams.get('id');
      if (!skillId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing skill id parameter' }));
        return;
      }
      // Return 404 here — ClawEye dashboard (Sprint 4) will serve cached results
      // For now the extension falls back to inline scan
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Skill not yet scanned — platform scan pending' }));
      return;
    }

    // ── /tools/invoke interceptor ─────────────────────────────────────────
    if (req.url?.startsWith('/tools/invoke') || req.url?.startsWith('/api/tool')) {
      interceptToolCall(req, res);
      return;
    }

    // ── All other HTTP traffic: proxy to OpenClaw ─────────────────────────
    const proxy = createProxyMiddleware({
      target: UPSTREAM_HTTP,
      changeOrigin: false,
      on: {
        error: (err, _req, res) => {
          log.error('HTTP proxy error', { error: err.message });
          if (res instanceof http.ServerResponse) {
            res.writeHead(502);
            res.end('ClawGuard: upstream unavailable');
          }
        }
      }
    });
    proxy(req, res, () => { /* noop */ });
  });

  server.listen(HEALTH_PORT, '127.0.0.1', () => {
    log.info(`ClawGuard HTTP proxy + health endpoint listening on :${HEALTH_PORT}`);
  });

  return server;
}

function interceptToolCall(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = '';

  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });

  req.on('end', () => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      // Not JSON — pass through
      forwardRequest(req, res, body);
      return;
    }

    const toolName = String(payload['tool'] ?? payload['name'] ?? '');
    const toolInput = JSON.stringify(payload['input'] ?? payload['arguments'] ?? {});
    const targetUrl = String(payload['url'] ?? payload['endpoint'] ?? '');

    // ── 1. Tool name blocklist check ─────────────────────────────────────
    if (toolBlocklist.tool_names.block.some(blocked => toolName.includes(blocked))) {
      log.warn(`Tool blocked: ${toolName}`, { reason: 'tool-blocklist' });
      eventBus.emit('clawguard:tool-blocked', {
        source: 'clawguard',
        severity: 'block',
        category: 'tool_abuse',
        description: `Tool call blocked: "${toolName}" is on the blocklist`,
        payload: { toolName, input: toolInput.slice(0, 200) }
      });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ClawSentinel: tool blocked by security policy', tool: toolName }));
      return;
    }

    // ── 2. Shell command blocklist check ──────────────────────────────────
    const shellCommands = toolBlocklist.shell_commands.block;
    const blockedCmd = shellCommands.find(cmd => toolInput.includes(cmd));
    if (blockedCmd) {
      log.warn(`Shell command blocked in tool input: ${blockedCmd}`);
      eventBus.emit('clawguard:shell-blocked', {
        source: 'clawguard',
        severity: 'block',
        category: 'tool_abuse',
        description: `Shell command blocked: "${blockedCmd}" in tool "${toolName}"`,
        payload: { toolName, blockedCommand: blockedCmd }
      });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ClawSentinel: shell command blocked', command: blockedCmd }));
      return;
    }

    // ── 3. Filesystem path blocklist check ────────────────────────────────
    const blockedPath = toolBlocklist.filesystem_paths.block.find(p => toolInput.includes(p));
    if (blockedPath) {
      log.warn(`Filesystem path blocked: ${blockedPath}`);
      eventBus.emit('clawguard:path-blocked', {
        source: 'clawguard',
        severity: 'block',
        category: 'tool_abuse',
        description: `Filesystem access blocked: "${blockedPath}" in tool "${toolName}"`,
        payload: { toolName, blockedPath }
      });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ClawSentinel: filesystem access blocked', path: blockedPath }));
      return;
    }

    // ── 4. Domain allowlist check for outbound HTTP ───────────────────────
    if (targetUrl) {
      const blockedPatterns = domainAllowlist.blocked_patterns.map(p => new RegExp(p));
      const isBlocked = blockedPatterns.some(p => p.test(targetUrl));
      const isAllowed = domainAllowlist.allowed.some(a => targetUrl.startsWith(a));

      if (isBlocked) {
        log.warn(`Outbound domain blocked: ${targetUrl}`);
        eventBus.emit('clawguard:domain-blocked', {
          source: 'clawguard',
          severity: 'block',
          category: 'exfiltration',
          description: `Outbound request blocked: "${targetUrl}" matches blocklist`,
          payload: { targetUrl, toolName }
        });
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ClawSentinel: outbound domain blocked', url: targetUrl }));
        return;
      }

      if (!isAllowed) {
        log.warn(`Outbound domain not in allowlist: ${targetUrl} — warn only`);
        eventBus.emit('clawguard:domain-warn', {
          source: 'clawguard',
          severity: 'warn',
          category: 'exfiltration',
          description: `Outbound request to non-allowlisted domain: "${targetUrl}"`,
          payload: { targetUrl, toolName }
        });
        // Warn but allow — user may be doing legitimate browsing
      }
    }

    // ── 5. Raw API key detection in outbound payload ──────────────────────
    const rawKeys = detectRawKeys(body);
    if (rawKeys.length > 0) {
      log.error('Raw API key detected in tool call payload — T7 threat', { keys: rawKeys });
      eventBus.emit('clawguard:key-in-tool-call', {
        source: 'clawguard',
        severity: 'critical',
        category: 'credential',
        description: 'Raw API key in tool call — credential exfiltration risk (T7)',
        payload: { toolName, keyPrefixes: rawKeys }
      });
    }

    // ── 6. ClawVault credential injection ────────────────────────────────
    // Resolve @vault:name references before forwarding to OpenClaw
    if (targetUrl) {
      const { resolved, count } = resolveVaultRefs(body, targetUrl);
      if (count > 0) {
        log.info(`Resolved ${count} vault reference(s) for ${targetUrl}`);
        forwardRequest(req, res, resolved);
        return;
      }
    }

    // ── 7. Pattern scan on injection via tool input ───────────────────────
    const patternResult = patternEngine.scan(toolInput);
    const blockThreshold = config.load().clawguard.blockThreshold;
    if (patternResult.score >= blockThreshold) {
      log.warn(`Tool input blocked by pattern engine (score ${patternResult.score})`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'ClawSentinel: injection pattern in tool input',
        score: patternResult.score
      }));
      return;
    }

    // PASS — forward original request
    forwardRequest(req, res, body);
  });
}

function forwardRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string
): void {
  const upstreamUrl = new URL(UPSTREAM_HTTP);
  const options: http.RequestOptions = {
    hostname: upstreamUrl.hostname,
    port: parseInt(upstreamUrl.port || '80', 10),
    path: req.url,
    method: req.method,
    headers: { ...req.headers, 'content-length': Buffer.byteLength(body).toString() }
  };

  const upstreamReq = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 200, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    log.error('Forward request failed', { error: err.message });
    res.writeHead(502);
    res.end('ClawGuard: upstream error');
  });

  upstreamReq.write(body);
  upstreamReq.end();
}
