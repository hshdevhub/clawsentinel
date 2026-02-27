# ClawSentinel Guard — Extension Test Cases

## Setup

```bash
# Build the extension
cd packages/extension
node scripts/build.js

# Load in Chrome
# chrome://extensions → Enable Developer mode → Load unpacked → select dist/
```

---

## 1. Page Injection Scanner Tests

Open `tests/scanner-test.html` in Chrome with the extension loaded.

| ID | Description | How to verify | Expected icon | Expected finding |
|----|-------------|---------------|---------------|-----------------|
| TC-01 | HTML comment injection | Open scanner-test.html | 🔴 Red | COM001 · "Instruction hidden in HTML comment" · location: page source |
| TC-02 | Visible "ignore previous instructions" text | Open scanner-test.html | 🔴 Red | INJ001 · location: text node |
| TC-03 | Hidden div (display:none) with jailbreak phrase | Open scanner-test.html | 🔴 Red | INJ003 · location: hidden ([style*="display:none"]) |
| TC-04 | White-text hidden injection (color:white) | Open scanner-test.html | 🔴 Red | INJ004 · location: hidden ([style*="color:white"]) |
| TC-05 | Fake SYSTEM prefix in meta tag | Open scanner-test.html | 🔴 Red | INJ004 · location: meta[x-test-payload] |
| TC-06 | Exfiltration command in visible text | Open scanner-test.html | 🔴 Red | EXF001 · location: text node |
| TC-07 | LLM format token [INST] injection | Open scanner-test.html | 🔴 Red | INJ007 · location: text node |
| TC-08 | Unicode RLO / zero-width character | Open scanner-test.html | 🔴 Red | UNI001 · location: text node |
| TC-09 | Base64-encoded "Ignore all previous instructions" | Open scanner-test.html | 🔴 Red | ENC001 · location: text node |
| TC-10 | Hidden goal injection (font-size:0) | Open scanner-test.html | 🔴 Red | GOL001 · location: hidden ([style*="font-size: 0"]) |
| TC-11 | Memory + exfil combo in HTML comment | Open scanner-test.html | 🔴 Red | MEM001 · location: page source |
| TC-12 | JSON-LD structured data injection | Open scanner-test.html | 🔴 Red | INJ001 · location: json-ld |
| TC-13 | data-prompt attribute injection | Open scanner-test.html | 🔴 Red | INJ001 · location: attr[data-prompt] |

---

## 2. False Positive / Clean Page Tests

Open `tests/clean-page-test.html` in Chrome.

| ID | Description | Expected icon | Expected result |
|----|-------------|---------------|-----------------|
| TC-FP-01 | Normal article about node_modules | 🟢 Green | 0 findings |
| TC-FP-02 | AI task management article | 🟢 Green | 0 findings |
| TC-FP-03 | Python subprocess code example | 🟢 Green | 0 findings |
| TC-FP-04 | API key best practices article | 🟢 Green | 0 findings |
| TC-FP-05 | System admin article with "override" and "previous instructions" in normal context | 🟢 Green | 0 findings — phrase "Ignore any outdated steps" must NOT trigger INJ001 |

---

## 3. Popup UI Tests

For each test, navigate to the relevant page and click the extension icon.

| ID | Description | Steps | Expected popup state |
|----|-------------|-------|----------------------|
| TC-POP-01 | Popup on clean page | Open clean-page-test.html, click icon | ✅ banner green · "Clean — No injection patterns detected" · 0 findings |
| TC-POP-02 | Popup on attack page | Open scanner-test.html, click icon | 🔴 banner red · "N injection patterns — do not share with AI" · findings list sorted by weight |
| TC-POP-03 | Findings sorted by severity | Open scanner-test.html, click icon | Highest weight rules appear first in the list |
| TC-POP-04 | Finding shows location | Open scanner-test.html, click icon | Each finding row shows "in page source" / "in text node" / "in hidden (selector)" |
| TC-POP-05 | Platform offline indicator | Platform not running, click icon on any page | Footer shows "⚫ Platform offline" |
| TC-POP-06 | Platform online indicator | `clawsentinel start`, click icon on any page | Footer shows "🟢 Platform running" |
| TC-POP-07 | Scan pending state | Click icon immediately on page load (< 800ms) | "Scan pending — reload the page" message |
| TC-POP-08 | Hostname displayed correctly | Open any page, click icon | Correct hostname shown (e.g., "example.com") |
| TC-POP-09 | Scanned-at timestamp | Hover over hostname in popup | Tooltip shows "Scanned at HH:MM:SS AM/PM" |
| TC-POP-10 | ClawSentinel Platform link | Click "ClawSentinel Platform →" in popup footer | Opens https://clawsentinel.dev in new tab |

---

## 4. Toolbar Icon State Tests

| ID | Description | Expected icon | Notes |
|----|-------------|---------------|-------|
| TC-ICO-01 | Before page scan | ⬜ Grey | Default on extension load |
| TC-ICO-02 | Clean page | 🟢 Green | After scanner-test or clean page loads |
| TC-ICO-03 | Warning page (weight 4–7) | 🟡 Yellow | Create a page with only a low-weight pattern |
| TC-ICO-04 | Danger page (weight ≥ 8) | 🔴 Red | scanner-test.html triggers this |
| TC-ICO-05 | Icon resets on navigation | Navigate away from attack page | Icon returns to grey then re-evaluates new page |
| TC-ICO-06 | Badge count ≤ 9 findings | Open scanner-test.html | Badge shows exact count (e.g., "7") |
| TC-ICO-07 | Badge count > 9 findings | Page with 10+ matches | Badge shows "9+" in red |
| TC-ICO-08 | Badge count 1–2 findings | Low-injection page | Badge shows count in amber (#f59e0b) |
| TC-ICO-09 | Badge count ≥ 3 findings | scanner-test.html | Badge shows count in red (#ef4444) |
| TC-ICO-10 | Clean page clears badge | Navigate from attack page to clean page | Badge disappears (no text) |
| TC-ICO-11 | Each tab is independent | Open attack page in tab 1, clean page in tab 2 | Tab 1 red, Tab 2 green — no cross-contamination |
| TC-ICO-12 | Tab close cleans up memory | Open many tabs, close them | Memory doesn't grow (no leak from tabResults Map) |

---

## 5. Badge Injector Tests (clawhub.ai)

**Setup:** Temporarily add `http://127.0.0.1/*` to manifest content_scripts matches, rebuild, reload extension. Serve tests/ with `npx serve packages/extension/tests -p 8899` and open `http://127.0.0.1:8899/clawhub-badge-test.html`.

| ID | Description | Expected result |
|----|-------------|-----------------|
| TC-BADGE-01 | Badge appears on `.skill-card` elements | Badge visible top-right of each `.skill-card` div |
| TC-BADGE-02 | Badge appears via `data-skill-id` attribute | Tier-1 selector matches, badge injected |
| TC-BADGE-03 | Badge appears via `data-testid="skill-card"` | Tier-1 selector matches, badge injected |
| TC-BADGE-04 | Plain content div (no skill selectors) | NO badge injected |
| TC-BADGE-05 | Badge shows "⏳ Scanning…" immediately | Loading spinner visible on card for ~500ms |
| TC-BADGE-06 | Badge settles to state after API attempt | ⬜ Unscanned (API doesn't exist locally) or scan result |
| TC-BADGE-07 | Badge doesn't break card layout | Card still renders correctly after badge injection |
| TC-BADGE-08 | No duplicate badges on re-render | Scroll away and back — badge not duplicated |
| TC-BADGE-09 | SPA navigation re-injects badges | Change URL hash — badges appear on new skill cards |
| TC-BADGE-10 | `position:relative` only set if card is `static` | Card with explicit position:absolute not overridden |

---

## 6. Bundled Rules Loading Test

| ID | Description | Steps | Expected |
|----|-------------|-------|----------|
| TC-RULES-01 | Bundled JSON rules loaded at runtime | Open DevTools → Network on any page with extension → filter by "injection-patterns" | `chrome-extension://.../rules/injection-patterns.json` fetch appears with 200 status |
| TC-RULES-02 | Rules from JSON supplement hardcoded rules | Open scanner-test.html → popup → check finding IDs | Finding IDs from bundled JSON (not just the 17 hardcoded ones) appear in findings list |
| TC-RULES-03 | Scan still works if bundled JSON 404s | Remove `rules/injection-patterns.json` from dist/, reload extension | Extension still scans using hardcoded 17 patterns, no crash |

---

## 7. Regression / Edge Cases

| ID | Description | Expected |
|----|-------------|----------|
| TC-REG-01 | Page with no `<body>` (XML / error page) | Extension doesn't throw, icon stays grey |
| TC-REG-02 | Very long page (10MB+ HTML) | Scanner completes within ~2s, no timeout |
| TC-REG-03 | Page with `sessionStorage` blocked (iframe sandbox) | Extension doesn't throw — cache write is wrapped in try/catch |
| TC-REG-04 | Extension context invalidated mid-navigation | `sendMessage` fails silently — no uncaught exception |
| TC-REG-05 | `chrome.webNavigation` not available | `?.` optional chaining on line 85 of service-worker.js prevents crash |
| TC-REG-06 | Multiple injection of same pattern ID | Only one finding per rule ID — deduplication in `scanPage()` |
| TC-REG-07 | Pattern regex error in bundled JSON | `loadBundledRules()` catches invalid regex and skips — other rules still load |

---

## Known Limitations (not bugs)

| Item | Status | Notes |
|------|--------|-------|
| ClawHub selector accuracy | Placeholder | Selectors target `.skill-card`, `[data-skill-id]`, etc. — must verify against real clawhub.ai DOM once site launches |
| `clawhub.ai/api/skills/{id}/source` | Not implemented | API doesn't exist yet — badges show ⬜ Unscanned. Will be implemented when ClawHub launches |
| Platform skill scan API | Returns 404 by design | `/api/skills/scan-result` is a stub — extension falls through to inline scan correctly |
| Bundled rules (25) vs platform (292) | Known gap | Extension bundles a subset. Live rule sync from platform is a planned future feature |
