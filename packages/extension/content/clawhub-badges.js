'use strict';

// ClawSentinel Guard — ClawHub Badge Injector
// Runs only on clawhub.ai skill pages.
// Injects a security score badge on every skill card before the user clicks install.

// ─── Scan result cache ────────────────────────────────────────────────────────
const scanCache = new Map();

// ─── Selector strategy ────────────────────────────────────────────────────────
// Try progressively broader selectors to find skill cards regardless of the
// exact class names ClawHub uses. Each tier is tried in order; the first that
// returns at least one element wins.

const CARD_SELECTOR_TIERS = [
  // Tier 1 — explicit semantic attributes (most reliable)
  '[data-skill-id], [data-testid="skill-card"], [data-testid="skill-item"]',
  // Tier 2 — conventional class names
  '.skill-card, .skill-item, .skill-listing-item, .skill-tile',
  // Tier 3 — any anchor whose href contains "/skills/" wrapped in a containing block
  'a[href*="/skills/"]',
];

// Wait selector covers all tiers combined
const WAIT_SELECTOR = CARD_SELECTOR_TIERS.join(', ');

function findSkillCards() {
  for (const selector of CARD_SELECTOR_TIERS) {
    const nodes = document.querySelectorAll(selector);
    if (nodes.length > 0) return nodes;
  }
  return [];
}

// ─── Badge injection ──────────────────────────────────────────────────────────

async function injectBadges() {
  // Wait for any skill card variant to render (ClawHub is a React SPA)
  await waitForElement(WAIT_SELECTOR);

  const skillCards = findSkillCards();

  for (const card of skillCards) {
    // For anchor-tier matches, walk up to a containing block element
    const container = card.closest('article, li, [class*="card"], [class*="tile"], [class*="item"]') ?? card;

    const skillId   = container.dataset.skillId
                   || container.dataset.id
                   || card.dataset.skillId
                   || container.querySelector('[data-id]')?.dataset.id
                   || extractIdFromCard(container)
                   || extractIdFromUrl(card.href ?? card.querySelector('a[href*="/skills/"]')?.href);

    const skillName = container.querySelector('h2, h3, h4, [class*="name"], [class*="title"]')?.textContent?.trim()
                   || card.textContent?.trim().slice(0, 40);

    if (!skillId && !skillName) continue;
    if (container.querySelector('.clawsentinel-badge')) continue; // already injected

    const badge = createBadge(null);
    // Only set position:relative if not already positioned, to avoid breaking layouts
    const pos = getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';
    container.appendChild(badge);

    getScanResult(skillId ?? skillName, skillName, container)
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
  } catch { /* platform not running — fall through */ }

  // 2. Fallback: scan the card's visible text (title + description) directly from DOM.
  // ClawHub does not expose a public source API, so this is always the practical fallback.
  // This gives real signal on description-level threats without any external API call.
  const cardText = extractCardText(card);
  if (cardText) {
    const result = scanSkillSource(cardText, skillName ?? skillId ?? 'Unknown');
    result.source = 'description';
    result.limited = true; // signals that only card text was scanned, not full YAML source
    scanCache.set(cacheKey, result);
    return result;
  }

  return { score: null, status: 'unscanned', findings: [], source: 'none' };
}

// Extract visible text content from a skill card for inline scanning.
// Collects title, description, and any visible paragraph/span text.
function extractCardText(card) {
  const parts = [];

  // Title — check common heading and title selectors
  const title = card.querySelector('h1, h2, h3, h4, h5, [class*="name"], [class*="title"], [class*="heading"]');
  if (title) parts.push(title.textContent.trim());

  // Description / summary
  const desc = card.querySelector('p, [class*="desc"], [class*="summary"], [class*="content"], [class*="subtitle"]');
  if (desc) parts.push(desc.textContent.trim());

  // Any remaining text nodes in spans (catches author, tags, etc.)
  card.querySelectorAll('span, small').forEach(el => {
    const t = el.textContent.trim();
    if (t.length > 4 && !parts.includes(t)) parts.push(t);
  });

  const joined = parts.join(' ').trim();
  return joined.length > 5 ? joined : null;
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
    badge.innerHTML = `<span class="cs-badge cs-unscanned" title="Could not scan this skill. Install ClawSentinel platform for full protection.">⬜ Unscanned</span>`;
    return;
  }

  const { score, status, findings } = result;
  const isLimited = result.limited === true; // description-only scan, not full YAML

  const icon  = status === 'safe'    ? '✅'
              : status === 'warning' ? '⚠️'
              : '🔴';

  // For limited (description-only) scans: show "Desc. Clean" or normal risk labels
  const label = isLimited && status === 'safe'
              ? 'Desc. Clean'
              : status === 'safe'    ? `${score}/100 Safe`
              : status === 'warning' ? `${score}/100 Review`
              : `${score}/100 Risk`;

  const tipLines = findings.slice(0, 5).map(f => `• ${f.label}`);
  if (findings.length > 5) tipLines.push(`… and ${findings.length - 5} more`);
  const baseNote = isLimited
    ? 'Description scan only — install ClawSentinel platform for full YAML analysis.'
    : 'No issues found';
  const tip = tipLines.length > 0 ? tipLines.join('\n') + '\n\n' + baseNote : baseNote;
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
  // Try any anchor in the card — clawhub.ai uses /$owner/$slug, not /skills/$slug
  const link = card.querySelector('a[href]');
  return link ? extractIdFromUrl(link.href) : null;
}

function extractIdFromUrl(url) {
  if (!url) return null;

  // Pattern 1: /skills/slug  (original assumed format)
  const skillsMatch = url.match(/\/skills\/([^/?#]+)/);
  if (skillsMatch) return skillsMatch[1];

  // Pattern 2: /$owner/$slug  (actual clawhub.ai format, e.g. /steipete/gog)
  // Exclude common non-skill paths
  const ownerSlugMatch = url.match(/\/(@?[a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:[?#]|$)/);
  if (ownerSlugMatch) {
    const [, owner, slug] = ownerSlugMatch;
    const skip = new Set(['api', 'assets', 'static', 'skills', 'search', 'upload', 'import']);
    if (!skip.has(owner.replace('@', ''))) return `${owner.replace('@', '')}/${slug}`;
  }

  return null;
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
