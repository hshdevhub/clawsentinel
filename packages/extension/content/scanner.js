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

// ─── Run scan + report to background ──────────────────────────────────────────

(function main() {
  // Small delay to let SPA content render
  setTimeout(() => {
    let findings, risk;

    try {
      findings = scanPage();
      risk = computeRisk(findings);
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
