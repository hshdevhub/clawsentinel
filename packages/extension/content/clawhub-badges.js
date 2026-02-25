'use strict';

// ClawSentinel Guard — ClawHub Badge Injector
// Runs only on clawhub.ai skill pages.
// Injects a security score badge on every skill card before the user clicks install.

// ─── Scan result cache ────────────────────────────────────────────────────────
const scanCache = new Map();

// ─── Badge injection ──────────────────────────────────────────────────────────

async function injectBadges() {
  // Wait for skill cards to render (ClawHub is a React SPA)
  await waitForElement('.skill-card, [data-skill-id], .skill-listing, [data-testid="skill-card"]');

  const skillCards = document.querySelectorAll(
    '.skill-card, [data-skill-id], [data-testid="skill-card"]'
  );

  for (const card of skillCards) {
    const skillId   = card.dataset.skillId
                   || card.querySelector('[data-id]')?.dataset.id
                   || extractIdFromCard(card);
    const skillName = card.querySelector('.skill-name, h3, h4, [class*="title"]')?.textContent?.trim();

    if (!skillId && !skillName) continue;
    if (card.querySelector('.clawsentinel-badge')) continue; // already injected

    const badge = createBadge(null);
    card.style.position = 'relative';
    card.appendChild(badge);

    getScanResult(skillId ?? skillName, skillName, card)
      .then(result => updateBadge(badge, result))
      .catch(() => updateBadge(badge, { score: null, status: 'unscanned', findings: [] }));
  }
}

async function getScanResult(skillId, skillName, card) {
  const cacheKey = skillId || skillName;
  if (scanCache.has(cacheKey)) return scanCache.get(cacheKey);

  // 1. Try ClawSentinel platform HTTP API at :18791 (only available if platform is running)
  try {
    const res = await fetch(
      `http://localhost:18791/api/skills/scan-result?id=${encodeURIComponent(cacheKey)}`,
      { signal: AbortSignal.timeout(500) }
    );
    if (res.ok) {
      const data = await res.json();
      data.source = 'platform';
      scanCache.set(cacheKey, data);
      return data;
    }
  } catch { /* platform not running — fall through to inline scan */ }

  // 2. Fallback: fetch skill source from ClawHub API and scan inline
  const skillUrl = card.querySelector('a[href*="/skills/"]')?.href;
  const id = skillId || extractIdFromUrl(skillUrl);

  if (id) {
    try {
      const res = await fetch(`https://clawhub.ai/api/skills/${encodeURIComponent(id)}/source`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const source = await res.text();
        const result = scanSkillSource(source, skillName ?? id);
        result.source = 'extension-inline';
        scanCache.set(cacheKey, result);
        return result;
      }
    } catch { /* skill source not available */ }
  }

  return { score: null, status: 'unscanned', findings: [], source: 'none' };
}

// Inline static analysis — mirrors the ClawHub Scanner platform rules
function scanSkillSource(source, name) {
  const findings = [];

  // Shell execution (block)
  if (/\bexec\s*\(|\bspawn\s*\(|\bexecSync\s*\(|\bchild_process\b/.test(source))
    findings.push({ label: 'Shell execution detected', severity: 'block' });

  if (/\/bin\/(bash|sh|zsh)|\bnetcat\b|\bnc\b|\bmkfifo\b/.test(source))
    findings.push({ label: 'Reverse shell technique', severity: 'block' });

  // Obfuscation (block)
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(source))
    findings.push({ label: 'Code evaluation (eval/new Function)', severity: 'block' });

  if (/eval\s*\(\s*(?:Buffer\.from|atob)|require\s*\(\s*(?:Buffer\.from|atob)/.test(source))
    findings.push({ label: 'Obfuscated dynamic execution', severity: 'block' });

  // Credential access (block)
  if (/~\/\.ssh\/|~\/\.aws\/|~\/\.openclaw\/config/.test(source))
    findings.push({ label: 'Credential file access', severity: 'block' });

  if (/process\.env\s*\.\s*(?:ANTHROPIC|OPENAI|CLAUDE|GPT)[_A-Z]*KEY/i.test(source))
    findings.push({ label: 'API key environment variable access', severity: 'block' });

  // Embedded injection payload (block)
  if (/systemPrompt\s*[:=]\s*['"`][^'"]*(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?)/i.test(source))
    findings.push({ label: 'Prompt injection embedded in skill', severity: 'block' });

  // Outbound HTTP to unknown domains (warn)
  const urls = source.match(/https?:\/\/[^\s"'`)\]]+/g) ?? [];
  const knownDomains = ['api.anthropic.com', 'api.openai.com', 'clawhub.ai', 'openclaw.ai',
                        'github.com', 'raw.githubusercontent.com', 'registry.npmjs.org'];
  const unknownUrls = urls.filter(u => !knownDomains.some(d => u.includes(d)));
  if (unknownUrls.length > 0)
    findings.push({ label: `Outbound HTTP: ${unknownUrls[0]}`, severity: 'warn' });

  // Private IP / SSRF (block)
  if (/https?:\/\/(?:10\.|192\.168\.|127\.0\.0\.1|localhost)/.test(source))
    findings.push({ label: 'Internal/loopback HTTP call (SSRF)', severity: 'block' });

  // Cron / persistence (block)
  if (/\bcrontab\b|\blaunchctl\b|\bsystemctl\s+enable/.test(source))
    findings.push({ label: 'Persistence mechanism (cron/service)', severity: 'block' });

  const blocks = findings.filter(f => f.severity === 'block').length;
  const warns  = findings.filter(f => f.severity === 'warn').length;
  const score  = Math.max(0, Math.round(100 - blocks * 35 - warns * 12));
  const status = blocks > 0 ? 'danger' : warns > 0 ? 'warning' : 'safe';

  return { score, status, findings, name };
}

// ─── Badge UI ──────────────────────────────────────────────────────────────────

function createBadge(result) {
  const badge = document.createElement('div');
  badge.className = 'clawsentinel-badge';
  updateBadge(badge, result);
  return badge;
}

function updateBadge(badge, result) {
  if (!result) {
    badge.innerHTML = `<span class="cs-badge cs-loading" title="ClawSentinel is scanning this skill...">⏳ Scanning…</span>`;
    return;
  }

  if (result.score === null) {
    badge.innerHTML = `<span class="cs-badge cs-unscanned" title="Not yet scanned by ClawSentinel. Install ClawSentinel platform for full protection.">⬜ Unscanned</span>`;
    return;
  }

  const { score, status, findings } = result;
  const icon  = status === 'safe'    ? '✅'
              : status === 'warning' ? '⚠️'
              : '🔴';
  const label = status === 'safe'    ? `${score}/100 Safe`
              : status === 'warning' ? `${score}/100 Review`
              : `${score}/100 Risk`;

  const tipLines = findings.slice(0, 5).map(f => `• ${f.label}`);
  if (findings.length > 5) tipLines.push(`… and ${findings.length - 5} more`);
  const tip = tipLines.length > 0 ? tipLines.join('\n') : 'No issues found';
  const sourceNote = result.source === 'platform' ? ' (via ClawSentinel)' : '';

  badge.innerHTML = `
    <span class="cs-badge cs-${status}" title="${escapeHtml(tip)}${sourceNote}">
      ${icon} ${label}
    </span>
  `;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function waitForElement(selector, timeout = 6000) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) { resolve(); return; }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(resolve, timeout);
  });
}

function extractIdFromCard(card) {
  const link = card.querySelector('a[href*="/skills/"]');
  return link ? extractIdFromUrl(link.href) : null;
}

function extractIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/skills\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ─── Init ──────────────────────────────────────────────────────────────────────

injectBadges();

// Re-run on SPA navigation — ClawHub changes URL without full page reload
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(injectBadges, 700);
  }
}).observe(document.body, { childList: true, subtree: true });
