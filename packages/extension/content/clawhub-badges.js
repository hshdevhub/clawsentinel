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

// ─── Lazy-load + SPA observer ─────────────────────────────────────────────────
// Handles two cases:
//   1. Lazy / infinite scroll — new skill cards added to DOM as user scrolls
//   2. SPA navigation — ClawHub changes URL without a full page reload
//
// Strategy: debounce badge injection so rapid DOM mutations (e.g. 20 cards
// appended at once during a scroll batch) only trigger one re-scan pass.
// injectBadges() already skips cards that already have a badge, so it is safe
// to call repeatedly — it only processes new cards.

let _badgeTimer = null;

function scheduleBadgeInject(delay = 400) {
  if (_badgeTimer) clearTimeout(_badgeTimer);
  _badgeTimer = setTimeout(() => {
    _badgeTimer = null;
    injectBadges();
  }, delay);
}

let lastUrl = location.href;

new MutationObserver((mutations) => {
  // Case 1: URL changed (SPA navigation) — allow extra time for new page to render
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scheduleBadgeInject(700);
    return;
  }

  // Case 2: New nodes added to DOM (lazy load / infinite scroll)
  // Only re-scan when at least one added node contains meaningful content
  // (avoids firing on spinner/placeholder mutations)
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      // Quick check: does the added subtree contain any text-bearing element?
      if (node.querySelector('h2, h3, h4, p, [class*="card"], [class*="skill"]') ||
          node.matches('h2, h3, h4, p, [class*="card"], [class*="skill"]')) {
        scheduleBadgeInject(400);
        return; // one trigger per mutation batch is enough
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ─── Install Button Intercept ─────────────────────────────────────────────────
// Captures clicks on "Install" / "Add Skill" buttons in the capture phase —
// before ClawHub's own handlers fire.
//
// danger skills  → blocks install entirely (hard modal, no proceed option)
// warning skills → shows modal with "Proceed Anyway" option
// safe / unscanned → lets click through unchanged

const INSTALL_BTN_RE = /\b(install|add\s+skill|use\s+skill|get\s+skill|add\s+to\s+agent)\b/i;

let _installModalHost  = null;
let _bypassNextClick   = false;  // set true after "Proceed Anyway" to skip re-intercept

document.addEventListener('click', interceptInstallClick, true); // capture phase

function interceptInstallClick(e) {
  // Bypass: user already confirmed on a warn modal — let this click through once.
  if (_bypassNextClick) { _bypassNextClick = false; return; }

  // Only care about clicks on clickable elements
  const btn = e.target.closest('button, a[href], [role="button"]');
  if (!btn) return;

  const btnLabel = (btn.textContent?.trim() ?? '') + ' ' + (btn.getAttribute('aria-label') ?? '');
  if (!INSTALL_BTN_RE.test(btnLabel)) return;

  // Walk up to find the nearest skill card container
  const card = btn.closest(
    '[data-skill-id], [data-testid="skill-card"], [data-testid="skill-item"], ' +
    '.skill-card, .skill-item, .skill-listing-item, .skill-tile, article, li'
  );

  // Identify the skill — same logic as injectBadges(); fallback to current page URL
  const skillId = (card ? (
    card.dataset.skillId ||
    card.dataset.id ||
    extractIdFromCard(card) ||
    extractIdFromUrl(card.querySelector('a[href]')?.href)
  ) : null) ?? extractIdFromUrl(location.href);

  const skillName = card
    ?.querySelector('h2, h3, h4, [class*="name"], [class*="title"]')
    ?.textContent?.trim();

  const cacheKey = skillId ?? skillName;
  if (!cacheKey) return; // can't identify skill — let through

  const result = scanCache.get(cacheKey);
  if (!result || result.status === 'safe') return; // safe or not-yet-scanned — let through

  // Intercept!
  e.preventDefault();
  e.stopImmediatePropagation();

  if (result.status === 'danger') {
    showInstallModal(result, null); // hard block — no proceed option
  } else {
    // warning — show modal with Proceed Anyway
    const capturedBtn = btn;
    showInstallModal(result, () => {
      _bypassNextClick = true;
      capturedBtn.click();
    });
  }
}

function showInstallModal(result, onProceed) {
  if (_installModalHost) { _installModalHost.remove(); _installModalHost = null; }

  const isDanger  = result.status === 'danger';
  const accentClr = isDanger ? '#ff3b3b' : '#f59e0b';
  const bgClr     = isDanger ? '#1a0808' : '#1a1208';
  const titleText = isDanger ? 'INSTALL BLOCKED' : 'SECURITY WARNING';
  const icon      = isDanger ? '🔴' : '⚠️';
  const message   = isDanger
    ? 'ClawSentinel detected critical security threats in this skill. Installing it could compromise your AI agent or system.'
    : 'ClawSentinel detected suspicious patterns in this skill. Review the findings below before proceeding.';

  const skillDisplay = escapeHtml(result.name ?? 'This skill');

  const findingRows = (result.findings ?? []).slice(0, 6).map(f => `
    <div class="cs-row cs-row-${f.severity === 'block' ? 'hi' : 'lo'}">
      <span class="cs-sev">${f.severity === 'block' ? 'BLOCK' : 'WARN'}</span>
      <span class="cs-desc">${escapeHtml(f.label)}</span>
    </div>`).join('');

  const proceedBtn = onProceed
    ? `<button id="cs-proceed" class="cs-btn cs-btn-warn">Proceed Anyway →</button>`
    : '';

  const css = `
    :host { all: initial; }
    #cs-backdrop {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.72); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      animation: cs-fdin .15s ease;
    }
    @keyframes cs-fdin { from{opacity:0} to{opacity:1} }
    #cs-modal {
      background: #0d0d0d; border: 1.5px solid ${accentClr};
      border-radius: 14px; width: 440px; max-width: calc(100vw - 32px);
      max-height: calc(100vh - 80px); overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.8);
      font-family: system-ui,-apple-system,sans-serif; font-size: 13px; color: #f1f1f1;
      animation: cs-pop .18s ease;
    }
    @keyframes cs-pop { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    #cs-head {
      padding: 16px; border-bottom: 1px solid #1f1f1f;
      display: flex; align-items: flex-start; gap: 12px;
    }
    #cs-icon  { font-size: 26px; line-height: 1; flex-shrink: 0; }
    #cs-title { font-size: 14px; font-weight: 800; color: ${accentClr}; letter-spacing: .04em; }
    #cs-skill { font-size: 11px; color: #9ca3af; margin-top: 3px; }
    #cs-body  {
      padding: 14px 16px; background: ${bgClr}; border-bottom: 1px solid #1f1f1f;
      font-size: 13px; line-height: 1.55;
    }
    #cs-findings { padding: 12px 16px; border-bottom: 1px solid #1f1f1f; }
    #cs-findings-lbl {
      font-size: 10px; font-weight: 700; color: #6b7280;
      letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px;
    }
    .cs-row { display:flex; gap:8px; align-items:flex-start; padding:4px 0; border-bottom:1px solid #141414; }
    .cs-row:last-child { border-bottom:none; }
    .cs-sev { font-size:9px; font-weight:700; padding:2px 5px; border-radius:3px; flex-shrink:0; white-space:nowrap; }
    .cs-row-hi .cs-sev { background:#2d0a0a; color:#ff3b3b; }
    .cs-row-lo .cs-sev { background:#2d1f0a; color:#f59e0b; }
    .cs-desc { color:#d1d5db; font-size:12px; line-height:1.4; }
    #cs-actions {
      padding: 12px 16px;
      display: flex; gap: 8px; align-items: center; justify-content: flex-end;
    }
    #cs-brand { flex:1; font-size:10px; color:#374151; }
    .cs-btn { padding:8px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; }
    #cs-cancel { background:#1f1f1f; color:#f1f1f1; }
    #cs-cancel:hover { background:#2a2a2a; }
    .cs-btn-warn { background:#f59e0b; color:#000; }
    .cs-btn-warn:hover { background:#d97706; }
  `;

  const htm = `
    <div id="cs-backdrop">
      <div id="cs-modal" role="dialog" aria-modal="true" aria-labelledby="cs-title">
        <div id="cs-head">
          <span id="cs-icon">${icon}</span>
          <div>
            <div id="cs-title">ClawSentinel — ${titleText}</div>
            <div id="cs-skill">${skillDisplay}</div>
          </div>
        </div>
        <div id="cs-body">${message}</div>
        ${findingRows ? `<div id="cs-findings"><div id="cs-findings-lbl">Detected Threats</div>${findingRows}</div>` : ''}
        <div id="cs-actions">
          <span id="cs-brand">ClawSentinel Guard</span>
          ${proceedBtn}
          <button id="cs-cancel" class="cs-btn">← Cancel</button>
        </div>
      </div>
    </div>
  `;

  _installModalHost = document.createElement('div');
  _installModalHost.id = 'clawsentinel-modal-root';
  document.documentElement.appendChild(_installModalHost);

  const shadow  = _installModalHost.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  shadow.appendChild(styleEl);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = htm;
  shadow.appendChild(wrapper);

  function closeModal() {
    _installModalHost?.remove();
    _installModalHost = null;
  }

  shadow.querySelector('#cs-cancel').addEventListener('click', closeModal);

  // Backdrop click dismisses warning modals (danger requires explicit Cancel)
  if (onProceed) {
    shadow.querySelector('#cs-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'cs-backdrop') closeModal();
    });
  }

  // Proceed Anyway (warning only)
  if (onProceed) {
    shadow.querySelector('#cs-proceed')?.addEventListener('click', () => {
      closeModal();
      onProceed();
    });
  }
}
