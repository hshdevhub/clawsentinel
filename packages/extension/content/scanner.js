'use strict';

// ClawSentinel Guard — Page Injection Scanner
// Runs on every page at document_idle.
// Scans the full DOM for hidden prompt injection payloads.
// Sends results to the background service worker to update the toolbar icon.

// ─── Pattern definitions ───────────────────────────────────────────────────────
// Subset of ClawSentinel platform patterns, optimised for browser DOM scanning.
// Weights match the platform's scoring system for consistent UX.

const PATTERNS = [
  // HTML comment injections
  {
    id: 'COM001',
    label: 'Instruction hidden in HTML comment',
    weight: 9,
    test: (text) => /<!--[\s\S]*?(ignore\s+(all\s+)?previous\s+instructions?|override\s+safety|SYSTEM\s*:\s*(override|new)|you\s+are\s+now\s+in\s+(developer|jailbreak|god|dan)\s+mode|forget\s+(everything|all))/i.test(text)
  },
  // Classic override phrases
  {
    id: 'INJ001',
    label: 'Ignore previous instructions',
    weight: 9,
    test: (text) => /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i.test(text)
  },
  {
    id: 'INJ002',
    label: 'Context reset injection',
    weight: 8,
    test: (text) => /forget\s+(everything|all)\s+(you|I)\s+(were|was|have been)\s+told/i.test(text)
  },
  {
    id: 'INJ003',
    label: 'Persona hijack — developer/jailbreak mode',
    weight: 9,
    test: (text) => /you\s+are\s+now\s+in\s+(developer|jailbreak|god|dan|devel|unrestricted)\s+mode/i.test(text)
  },
  {
    id: 'INJ004',
    label: 'Fake SYSTEM prompt prefix',
    weight: 9,
    test: (text) => /\bSYSTEM\s*:\s*(override|disable|bypass|ignore|reset|new)/i.test(text)
  },
  {
    id: 'INJ005',
    label: 'New system prompt injection',
    weight: 9,
    test: (text) => /new\s+system\s+prompt\s*:/i.test(text)
  },
  {
    id: 'INJ006',
    label: 'False authority claim',
    weight: 8,
    test: (text) => /(?:I\s+am\s+(?:your|the)\s+(?:creator|developer|operator|admin|anthropic|openai)|as\s+your\s+new\s+(?:administrator|admin|operator))/i.test(text)
  },
  {
    id: 'INJ007',
    label: 'LLM format token injection (Mistral/ChatML)',
    weight: 8,
    test: (text) => /\[INST\]|\[SYS\]|<\|im_start\|>|<\|im_end\|>/.test(text)
  },
  // Exfiltration patterns
  {
    id: 'EXF001',
    label: 'Data exfiltration command in content',
    weight: 10,
    test: (text) => /\b(send|forward|transmit|exfiltrate|leak)\s+(all|any|the)\s+(data|information|content|messages?|conversations?)\s+to/i.test(text)
  },
  {
    id: 'EXF002',
    label: 'Shell exfiltration command',
    weight: 10,
    test: (text) => /cat\s+~\/\.ssh\/|curl\s+-d\s+@|nc\s+\S+\s+\d{4,5}/.test(text)
  },
  // Memory tampering
  {
    id: 'MEM001',
    label: 'Persistent memory injection with exfiltration',
    weight: 10,
    test: (text) => /(add|store|save|remember)\s+to\s+(your\s+)?(permanent\s+)?memory.{0,80}(send|exfil|forward|https?:\/\/|curl|fetch)/i.test(text)
  },
  {
    id: 'MEM002',
    label: 'Persistent behavioral injection via memory',
    weight: 9,
    test: (text) => /(add|store|save|remember)\s+to\s+(your\s+)?memory.{0,50}(always|every\s+time|from\s+now\s+on)/i.test(text)
  },
  // Unicode attacks
  {
    id: 'UNI001',
    label: 'Unicode direction override / zero-width characters',
    weight: 7,
    test: (text) => /[\u202e\u202d\u200b\u200c\u200d\ufeff\u2028\u2029]/.test(text)
  },
  // Base64 encoded payloads — only flag if it decodes to known phrases
  {
    id: 'ENC001',
    label: 'Possible base64-encoded injection payload',
    weight: 6,
    test: (text) => /\b[A-Za-z0-9+/]{40,}={0,2}\b/.test(text) &&
                    // "Ignore", "You are", "SYSTEM" base64 prefixes
                    /SWdub3Jl|aWdub3Jl|WW91IGFyZQ|U1lTVEVN/.test(text)
  },
  // Hidden goal injection
  {
    id: 'GOL001',
    label: 'Hidden goal / real purpose injection',
    weight: 8,
    test: (text) => /(your\s+)?(real|true|actual|hidden|secret)\s+(purpose|goal|mission|objective|task)\s+is/i.test(text)
  },
  // Deception injection
  {
    id: 'DEC001',
    label: 'Instruction to deceive the user',
    weight: 8,
    test: (text) => /do\s+not\s+(tell|inform|let|show)\s+(the\s+)?(user|human|operator|owner)/i.test(text)
  },
  {
    id: 'DEC002',
    label: 'Hidden instruction — keep secret from user',
    weight: 8,
    test: (text) => /keep\s+(this\s+)?(secret|hidden|confidential).{0,50}from\s+(the\s+)?(user|human|owner|operator)/i.test(text)
  }
];

// ─── DOM scanning ──────────────────────────────────────────────────────────────

function getPageContent() {
  const sources = [];

  // 1. Full page HTML — catches comments, hidden attrs, data attributes, everything
  sources.push({ label: 'page source', content: document.documentElement.innerHTML });

  // 2. All visible + hidden text nodes
  try {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent ? node.textContent.trim() : '';
      if (text.length > 10) {
        sources.push({ label: 'text node', content: text });
      }
    }
  } catch { /* body may not exist on certain pages */ }

  // 3. Hidden elements — most common injection hiding technique
  const hiddenSelectors = [
    '[style*="display:none"]',
    '[style*="display: none"]',
    '[style*="visibility:hidden"]',
    '[style*="visibility: hidden"]',
    '[style*="opacity:0"]',
    '[style*="font-size:0"]',
    '[style*="font-size: 0"]',
    '[style*="color:white"]',
    '[style*="color: white"]',
    '[style*="color:#fff"]',
    '[style*="color:#ffffff"]',
    '[aria-hidden="true"]',
    '.sr-only',
    '[style*="position:absolute"][style*="left:-"]',
    '[style*="clip:rect(0,0,0,0)"]',
    '[style*="height:0"]',
    '[style*="width:0"]'
  ];

  for (const sel of hiddenSelectors) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.textContent ? el.textContent.trim() : '';
        if (text.length > 5) {
          sources.push({ label: `hidden (${sel})`, content: text });
        }
      });
    } catch { /* invalid selector — skip */ }
  }

  // 4. Meta tags — og:description and twitter:description can carry instructions
  document.querySelectorAll('meta[content]').forEach(meta => {
    const content = meta.getAttribute('content');
    if (content && content.length > 5) {
      const name = meta.getAttribute('name') || meta.getAttribute('property') || 'meta';
      sources.push({ label: `meta[${name}]`, content });
    }
  });

  // 5. JSON-LD structured data — increasingly used for injection
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    if (script.textContent) {
      sources.push({ label: 'json-ld', content: script.textContent });
    }
  });

  // 6. Data attributes on elements (data-prompt, data-instructions, etc.)
  document.querySelectorAll('[data-prompt],[data-instructions],[data-system],[data-context]').forEach(el => {
    const attrs = ['data-prompt', 'data-instructions', 'data-system', 'data-context'];
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val && val.length > 5) {
        sources.push({ label: `attr[${attr}]`, content: val });
      }
    }
  });

  return sources;
}

function scanPage() {
  const findings = [];
  const sources = getPageContent();

  for (const { label, content } of sources) {
    for (const pattern of PATTERNS) {
      try {
        if (pattern.test(content)) {
          // Deduplicate — one finding per pattern ID
          if (!findings.find(f => f.id === pattern.id)) {
            findings.push({
              id: pattern.id,
              label: pattern.label,
              weight: pattern.weight,
              location: label
            });
          }
        }
      } catch { /* pattern error — skip */ }
    }
  }

  return findings;
}

function computeRisk(findings) {
  if (findings.length === 0) return { level: 'safe', score: 0, color: 'green' };
  const totalWeight = findings.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight >= 8)  return { level: 'danger',  score: totalWeight, color: 'red' };
  if (totalWeight >= 4)  return { level: 'warning', score: totalWeight, color: 'yellow' };
  return { level: 'info', score: totalWeight, color: 'green' };
}

// ─── Rule loading: platform live sync → bundled JSON → hardcoded 17 ──────────
// Priority order:
//   1. Platform /api/rules (292 rules, always up-to-date) — if ClawSentinel running
//   2. Bundled rules/injection-patterns.json (25 rules, always available offline)
//   3. Hardcoded PATTERNS array above (17 rules, last resort)

function mergeRules(rules) {
  for (const rule of rules) {
    if (PATTERNS.find(p => p.id === rule.id)) continue; // already loaded
    try {
      const re = new RegExp(rule.pattern, 'iu');
      PATTERNS.push({
        id: rule.id,
        label: rule.description ?? rule.id,
        weight: Math.min(Number(rule.weight) || 8, 10),
        test: (text) => re.test(text)
      });
    } catch { /* invalid regex in rule — skip */ }
  }
}

async function loadRules() {
  // 1. Try live platform rules (fastest if platform running — single fetch, 292 rules)
  try {
    const res = await fetch('http://localhost:18791/api/rules', {
      signal: AbortSignal.timeout(600)
    });
    if (res.ok) {
      const rules = await res.json();
      mergeRules(rules);
      return; // got full platform rules — done
    }
  } catch { /* platform offline */ }

  // 2. Fallback: bundled extension rules JSON
  try {
    const url = chrome.runtime.getURL('rules/injection-patterns.json');
    const res = await fetch(url);
    if (res.ok) mergeRules(await res.json());
  } catch { /* bundled rules unavailable — use hardcoded 17 only */ }
}

// ─── Right-click overlay — scan selected text ─────────────────────────────────
// Shown when the user right-clicks → "Scan with ClawSentinel" on selected text.
// Uses Shadow DOM for full CSS isolation from the page.

let _overlayHost = null;

// ─── Injection Highlighting state ─────────────────────────────────────────────
// Highlight rings + labels are injected after each scan, hidden by default.
// The popup "Show on page" button sends TOGGLE_HIGHLIGHTS to reveal them.
const _highlights = [];
let _highlightsVisible = false;

// Hidden-element selectors mirrored from getPageContent() for re-use in locator
const _HIDDEN_SELS = [
  '[style*="display:none"]', '[style*="display: none"]',
  '[style*="visibility:hidden"]', '[style*="visibility: hidden"]',
  '[style*="opacity:0"]', '[style*="font-size:0"]', '[style*="font-size: 0"]',
  '[style*="color:white"]', '[style*="color: white"]',
  '[style*="color:#fff"]', '[style*="color:#ffffff"]',
  '[aria-hidden="true"]', '.sr-only',
];

function scanText(text) {
  const findings = [];
  for (const pattern of PATTERNS) {
    try {
      if (pattern.test(text) && !findings.find(f => f.id === pattern.id)) {
        findings.push({ id: pattern.id, label: pattern.label, weight: pattern.weight });
      }
    } catch { /* skip */ }
  }
  const totalWeight = findings.reduce((s, f) => s + f.weight, 0);
  const level = totalWeight >= 8 ? 'danger' : totalWeight >= 4 ? 'warning' : 'safe';
  return { findings, totalWeight, level };
}

function showScanOverlay(text, platformResult) {
  // Remove any existing overlay
  if (_overlayHost) _overlayHost.remove();

  const result = platformResult ?? scanText(text);
  const { findings, level } = result;
  const totalWeight = platformResult?.rawScore ?? result.totalWeight;
  const score = platformResult?.score ?? (level === 'safe' ? 0 : totalWeight);

  const colors = {
    danger:  { bg: '#1a0808', border: '#ff3b3b', text: '#ff3b3b', badge: '#ff3b3b' },
    warning: { bg: '#1a1208', border: '#f59e0b', text: '#f59e0b', badge: '#f59e0b' },
    safe:    { bg: '#051a0e', border: '#22c55e', text: '#22c55e', badge: '#22c55e' }
  };
  const c = colors[level] ?? colors.safe;

  const icon    = level === 'danger' ? '🔴' : level === 'warning' ? '⚠️' : '✅';
  const verdict = level === 'danger' ? 'BLOCKED' : level === 'warning' ? 'SUSPICIOUS' : 'CLEAN';
  const source  = platformResult ? '292-rule engine' : `${PATTERNS.length}-rule engine`;

  const findingRows = findings.length === 0
    ? '<div class="cs-no-findings">No threat patterns matched.</div>'
    : findings.slice(0, 8).map(f => `
        <div class="cs-finding cs-finding-${f.weight >= 9 ? 'high' : f.weight >= 6 ? 'med' : 'low'}">
          <span class="cs-fid">${escHtml(f.id)}</span>
          <span class="cs-fdesc">${escHtml(f.label)}</span>
        </div>`).join('') +
      (findings.length > 8 ? `<div class="cs-more">+${findings.length - 8} more findings</div>` : '');

  const shadow_css = `
    :host { all: initial; }
    #cs-panel {
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      width: 360px; max-height: 480px; overflow-y: auto;
      background: #0d0d0d; border: 1px solid ${c.border};
      border-radius: 12px; font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px; color: #f1f1f1; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      animation: cs-slide-in 0.18s ease;
    }
    @keyframes cs-slide-in { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
    #cs-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid #1f1f1f;
    }
    #cs-title { font-weight: 700; font-size: 12px; color: #6b7280; letter-spacing: 0.06em; text-transform: uppercase; }
    #cs-close { background: none; border: none; color: #6b7280; cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }
    #cs-close:hover { color: #f1f1f1; }
    #cs-verdict {
      padding: 14px; background: ${c.bg}; border-bottom: 1px solid #1f1f1f;
      display: flex; align-items: center; gap: 10px;
    }
    #cs-icon { font-size: 22px; }
    #cs-verdict-text { flex: 1; }
    #cs-verdict-label { font-size: 15px; font-weight: 700; color: ${c.text}; }
    #cs-verdict-score { font-size: 11px; color: #6b7280; margin-top: 2px; }
    #cs-input-preview {
      padding: 10px 14px; background: #141414; border-bottom: 1px solid #1f1f1f;
      font-size: 11px; color: #9ca3af; font-family: monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #cs-findings { padding: 10px 14px; }
    #cs-findings-label { font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .cs-finding { display: flex; gap: 8px; align-items: flex-start; padding: 5px 0; border-bottom: 1px solid #1a1a1a; }
    .cs-finding:last-child { border-bottom: none; }
    .cs-fid { font-family: monospace; font-size: 10px; background: #1f1f1f; padding: 2px 5px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; }
    .cs-finding-high .cs-fid { background: #2d0a0a; color: #ff3b3b; }
    .cs-finding-med .cs-fid  { background: #2d1f0a; color: #f59e0b; }
    .cs-finding-low .cs-fid  { background: #1a1a1a; color: #9ca3af; }
    .cs-fdesc { color: #d1d5db; font-size: 12px; line-height: 1.4; }
    .cs-no-findings { color: #22c55e; font-size: 12px; padding: 4px 0; }
    .cs-more { color: #6b7280; font-size: 11px; padding: 4px 0; }
    #cs-footer { padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1f1f1f; }
    #cs-source { font-size: 10px; color: #374151; }
  `;

  const shadow_html = `
    <div id="cs-panel">
      <div id="cs-header">
        <span id="cs-title">ClawSentinel — Text Scan</span>
        <button id="cs-close" title="Close">✕</button>
      </div>
      <div id="cs-verdict">
        <span id="cs-icon">${icon}</span>
        <div id="cs-verdict-text">
          <div id="cs-verdict-label">${verdict}</div>
          <div id="cs-verdict-score">Score ${score}/100 · ${findings.length} finding${findings.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div id="cs-input-preview">${escHtml(text.slice(0, 120))}${text.length > 120 ? '…' : ''}</div>
      <div id="cs-findings">
        <div id="cs-findings-label">Findings (${findings.length})</div>
        ${findingRows}
      </div>
      <div id="cs-footer">
        <span id="cs-source">${source}</span>
      </div>
    </div>
  `;

  _overlayHost = document.createElement('div');
  _overlayHost.id = 'clawsentinel-overlay-root';
  document.documentElement.appendChild(_overlayHost);
  const shadow = _overlayHost.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = shadow_css;
  shadow.appendChild(style);
  shadow.innerHTML += shadow_html;

  // Close on X button or click outside
  shadow.getElementById('cs-close').addEventListener('click', () => {
    _overlayHost?.remove();
    _overlayHost = null;
  });
  document.addEventListener('click', function outsideClick(e) {
    if (!_overlayHost?.contains(e.target)) {
      _overlayHost?.remove();
      _overlayHost = null;
      document.removeEventListener('click', outsideClick);
    }
  }, { once: false, capture: true });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Visual Injection Highlighting ────────────────────────────────────────────
// For each finding, searches the DOM to locate the element that triggered it,
// then injects a coloured outline ring + floating label above it.
// All highlights start hidden; the popup toggle reveals / hides them.

function highlightFindings(findings) {
  if (!findings.length || !document.body) return;

  for (const finding of findings) {
    const pattern = PATTERNS.find(p => p.id === finding.id);
    if (!pattern) continue;
    const el = _findMatchingElement(pattern, finding.location);
    if (el) _highlightElement(el, finding);
  }
}

// Locate the DOM element that contains the text that triggered `pattern`.
// Uses location hint from finding.location when available.
function _findMatchingElement(pattern, location) {
  // Targeted lookup for specific location types
  if (location === 'json-ld') {
    return document.querySelector('script[type="application/ld+json"]') ?? null;
  }

  if (location.startsWith('hidden (')) {
    const m = location.match(/^hidden \((.+)\)$/);
    if (m) {
      try {
        for (const el of document.querySelectorAll(m[1])) {
          if (el.textContent && pattern.test(el.textContent)) return el;
        }
      } catch { /* invalid selector */ }
    }
  }

  if (location.startsWith('attr[')) {
    const attr = location.match(/^attr\[(.+)\]$/)?.[1];
    if (attr) {
      try {
        for (const el of document.querySelectorAll(`[${attr}]`)) {
          const val = el.getAttribute(attr);
          if (val && pattern.test(val)) return el;
        }
      } catch { /* skip */ }
    }
  }

  // General fallback: walk text nodes — catches 'text node' and 'page source'
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      if (text && text.length > 5 && pattern.test(text)) {
        return node.parentElement ?? null;
      }
    }
  } catch { /* skip */ }

  // Last resort: hidden elements
  for (const sel of _HIDDEN_SELS) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        if (el.textContent && pattern.test(el.textContent)) return el;
      }
    } catch { /* skip */ }
  }

  return null;
}

// Inject a coloured ring + label above `el`. Both start hidden (display:none).
function _highlightElement(el, finding) {
  if (!el || el === document.body || el === document.documentElement) return;

  // For zero-size elements (display:none), walk up to nearest visible ancestor
  let target = el;
  let rect   = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    let p = target.parentElement;
    while (p && p !== document.body) {
      rect = p.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) { target = p; break; }
      p = p.parentElement;
    }
    if (rect.width === 0 && rect.height === 0) return; // nothing visible
  }

  const isHigh  = finding.weight >= 9;
  const color   = isHigh ? '#dc2626' : '#d97706';
  const glowBg  = isHigh ? 'rgba(220,38,38,0.08)' : 'rgba(217,119,6,0.08)';
  const docLeft = Math.round(rect.left + window.scrollX);
  const docTop  = Math.round(rect.top  + window.scrollY);

  // Outline ring
  const ring = document.createElement('div');
  ring.dataset.csHighlight = '1';
  ring.style.cssText = [
    'position:absolute',
    `left:${docLeft}px`,
    `top:${docTop}px`,
    `width:${Math.max(Math.round(rect.width), 4)}px`,
    `height:${Math.max(Math.round(rect.height), 4)}px`,
    `outline:2px solid ${color}`,
    'outline-offset:2px',
    'border-radius:3px',
    `background:${glowBg}`,
    'pointer-events:none',
    'z-index:2147483640',
    'display:none',
    'box-sizing:border-box',
  ].join('!important;') + '!important';

  // Floating label — shown above the ring
  const labelTop = Math.max(docTop - 22, 0);
  const shortDesc = finding.label.length > 48
    ? finding.label.slice(0, 48) + '…'
    : finding.label;

  const lbl = document.createElement('div');
  lbl.dataset.csHighlight = '1';
  lbl.style.cssText = [
    'position:absolute',
    `left:${docLeft}px`,
    `top:${labelTop}px`,
    `background:${color}`,
    'color:#fff',
    'font-family:system-ui,-apple-system,sans-serif',
    'font-size:10px',
    'font-weight:700',
    'line-height:1.5',
    'padding:2px 7px',
    'border-radius:4px',
    'white-space:nowrap',
    'pointer-events:auto',
    'cursor:pointer',
    'z-index:2147483641',
    'letter-spacing:0.02em',
    'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
    'user-select:none',
    'max-width:300px',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'display:none',
  ].join('!important;') + '!important';

  lbl.textContent = `${finding.id} · ${shortDesc}`;
  lbl.title       = finding.label;

  document.documentElement.appendChild(ring);
  document.documentElement.appendChild(lbl);
  _highlights.push(ring, lbl);

  // Clicking the label opens the full scan overlay for that element's text
  lbl.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = target.textContent?.trim().slice(0, 500) || finding.label;
    showScanOverlay(text, null);
  });
}

function toggleHighlights(visible) {
  _highlightsVisible = visible;
  const display = visible ? 'block' : 'none';
  for (const el of _highlights) {
    el.style.setProperty('display', display, 'important');
  }
}

// ─── Message listener — receives SCAN_SELECTION from service worker ───────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_HIGHLIGHTS') {
    toggleHighlights(message.visible ?? !_highlightsVisible);
    return;
  }
  if (message.type !== 'SCAN_SELECTION' || !message.text) return;
  const text = message.text;

  // Try platform full scan first (292 rules), fall back to local patterns
  fetch('http://localhost:18791/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(1500)
  })
    .then(r => r.ok ? r.json() : null)
    .then(platformResult => showScanOverlay(text, platformResult))
    .catch(() => showScanOverlay(text, null));
});

// ─── Run scan + report to background ──────────────────────────────────────────

(async function main() {
  // Load rules: platform (292) → bundled JSON (25) → hardcoded (17)
  await loadRules();

  setTimeout(() => {
    let findings, risk;

    try {
      findings = scanPage();
      risk = computeRisk(findings);
      highlightFindings(findings); // inject rings hidden by default; popup toggles visibility
    } catch (err) {
      // Never crash the page — silently swallow scanner errors
      findings = [];
      risk = { level: 'error', score: 0, color: 'grey' };
    }

    const result = {
      url: location.href,
      hostname: location.hostname,
      scannedAt: new Date().toISOString(),
      findings,
      risk
    };

    // Send to background worker → updates toolbar icon
    try {
      chrome.runtime.sendMessage({ type: 'SCAN_RESULT', data: result });
    } catch { /* extension context may be invalidated on navigation */ }

    // Cache in sessionStorage for instant popup display (avoids async round-trip)
    try {
      sessionStorage.setItem('clawsentinel_scan', JSON.stringify(result));
    } catch { /* sessionStorage may be blocked on some pages */ }
  }, 800);
})();
