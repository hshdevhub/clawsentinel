'use strict';

// ClawSentinel Guard — Background Service Worker
// Manages per-tab scan results and toolbar icon state.

// ─── State ────────────────────────────────────────────────────────────────────
// tabResults: tabId → latest ScanResult for that tab
const tabResults = new Map();

// ─── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'SCAN_RESULT': {
      const tabId = sender.tab?.id;
      if (!tabId) break;

      const data = message.data;
      tabResults.set(tabId, data);
      updateIcon(tabId, data.risk.color);
      updateBadgeText(tabId, data.findings.length);
      break;
    }

    case 'GET_RESULT': {
      // Popup requests the current tab's result
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        sendResponse(tab?.id ? (tabResults.get(tab.id) ?? null) : null);
      });
      return true; // Keep message channel open for async response
    }

    case 'GET_STATS': {
      // Popup requests aggregate stats
      let total = 0, safe = 0, warned = 0, danger = 0;
      for (const result of tabResults.values()) {
        total++;
        if (result.risk.color === 'green')  safe++;
        if (result.risk.color === 'yellow') warned++;
        if (result.risk.color === 'red')    danger++;
      }
      sendResponse({ total, safe, warned, danger });
      break;
    }
  }
});

// ─── Icon state ────────────────────────────────────────────────────────────────

const ICON_MAP = {
  green:  { 16: 'icons/icon-green-16.png',  48: 'icons/icon-green-48.png'  },
  yellow: { 16: 'icons/icon-yellow-16.png', 48: 'icons/icon-yellow-48.png' },
  red:    { 16: 'icons/icon-red-16.png',    48: 'icons/icon-red-48.png'    },
  grey:   { 16: 'icons/icon-grey-16.png',   48: 'icons/icon-grey-48.png'   }
};

function updateIcon(tabId, color) {
  chrome.action.setIcon({
    tabId,
    path: ICON_MAP[color] ?? ICON_MAP.grey
  }).catch(() => { /* tab may have closed */ });
}

function updateBadgeText(tabId, findingCount) {
  if (findingCount === 0) {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }
  const text = findingCount > 9 ? '9+' : String(findingCount);
  const color = findingCount >= 3 ? '#ef4444' : '#f59e0b';

  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

// Clean up when tab closes — prevent memory leak
chrome.tabs.onRemoved.addListener(tabId => {
  tabResults.delete(tabId);
});

// Reset icon to grey on navigation start
chrome.webNavigation?.onBeforeNavigate?.addListener(({ tabId }) => {
  tabResults.delete(tabId);
  updateIcon(tabId, 'grey');
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
});
