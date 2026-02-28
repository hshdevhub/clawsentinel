'use strict';

// ClawSentinel Guard — Background Service Worker
// Manages per-tab scan results, toolbar icon state, and context menu.

// ─── State ────────────────────────────────────────────────────────────────────
// tabResults: tabId → latest ScanResult for that tab
const tabResults = new Map();

// notifiedTabs: tabId → true — prevents re-notifying the same page load
const notifiedTabs = new Set();

// ─── Context menu — "Scan with ClawSentinel" on text selection ───────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clawsentinel-scan-selection',
    title: 'Scan with ClawSentinel',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'clawsentinel-scan-selection') return;
  if (!tab?.id || !info.selectionText?.trim()) return;
  // Forward selected text to the content script on the active tab
  chrome.tabs.sendMessage(tab.id, {
    type: 'SCAN_SELECTION',
    text: info.selectionText.trim()
  }).catch(() => { /* content script may not be ready */ });
});

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

      // Browser notification for danger-level pages
      if (data.risk.color === 'red' && data.findings.length > 0) {
        notifyDanger(tabId, data);
      }
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

// ─── Browser notifications ─────────────────────────────────────────────────────

function notifyDanger(tabId, data) {
  // One notification per page load — don't spam on re-scans
  if (notifiedTabs.has(tabId)) return;
  notifiedTabs.add(tabId);

  chrome.storage.sync.get({ quietMode: false }, ({ quietMode }) => {
    if (quietMode) return;

    let hostname = data.hostname ?? 'this page';
    try { hostname = new URL(data.url).hostname; } catch { /* use fallback */ }

    const count    = data.findings.length;
    const topLabel = [...data.findings]
      .sort((a, b) => b.weight - a.weight)[0]?.label ?? '';

    chrome.notifications.create(`cs-${tabId}`, {
      type:           'basic',
      iconUrl:        'icons/icon-red-48.png',
      title:          'ClawSentinel — Threat Detected',
      message:        `${hostname}: ${count} injection pattern${count !== 1 ? 's' : ''} found`,
      contextMessage: topLabel.slice(0, 100),
      priority:       1
    }).catch(() => { /* notifications may be disabled by the OS or user */ });
  });
}

// Clicking a notification focuses the offending tab
chrome.notifications.onClicked.addListener((notifId) => {
  if (!notifId.startsWith('cs-')) return;
  const tabId = parseInt(notifId.slice(3), 10);
  if (!isNaN(tabId)) {
    chrome.tabs.update(tabId, { active: true }).catch(() => {});
  }
  chrome.notifications.clear(notifId).catch(() => {});
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
  notifiedTabs.delete(tabId);
});

// Reset icon and notification state on navigation start
chrome.webNavigation?.onBeforeNavigate?.addListener(({ tabId }) => {
  tabResults.delete(tabId);
  notifiedTabs.delete(tabId); // allow re-notification on next page load
  updateIcon(tabId, 'grey');
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
});
