'use strict';

// ClawSentinel Guard — Popup Script
// Reads the current tab's scan result from the background service worker
// and renders a clear risk summary for the user.

const SEVERITY_COLORS = {
  danger:  '#ef4444',
  warning: '#f59e0b',
  info:    '#10b981',
  safe:    '#10b981',
  error:   '#6b7280'
};

const BANNER_CLASSES = {
  green:  'banner-safe',
  yellow: 'banner-warning',
  red:    'banner-danger',
  grey:   'banner-scanning'
};

const RISK_LABELS = {
  safe:    '✅ Clean — No injection patterns detected',
  warning: '⚠️ Suspicious — Review before sharing with your AI',
  danger:  '🔴 Injection detected — Do not share with your AI agent',
  error:   '⏳ Scan pending — Reload the page to trigger scan'
};

async function init() {
  const hostnameEl       = document.getElementById('hostname');
  const riskBanner       = document.getElementById('risk-banner');
  const riskIcon         = document.getElementById('risk-icon');
  const riskLabel        = document.getElementById('risk-label');
  const findingsSection  = document.getElementById('findings-section');
  const findingsCount    = document.getElementById('findings-count');
  const findingsList     = document.getElementById('findings-list');
  const cleanSection     = document.getElementById('clean-section');
  const errorSection     = document.getElementById('error-section');
  const platformStatus   = document.getElementById('platform-status');

  // Get current tab info + scan result from background worker
  let result = null;
  try {
    result = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'GET_RESULT' }, resolve)
    );
  } catch {
    showError(errorSection, riskBanner, riskIcon, riskLabel);
    return;
  }

  // Check if ClawSentinel platform is running (non-blocking)
  checkPlatformStatus(platformStatus);

  if (!result) {
    // No result yet — page may not have finished scanning
    riskBanner.className = 'banner-scanning';
    riskIcon.textContent = '⏳';
    riskLabel.textContent = 'Scan pending — reload the page to trigger scan';
    hostnameEl.textContent = 'Waiting for scan…';
    return;
  }

  // Render hostname
  try {
    const url = new URL(result.url);
    hostnameEl.textContent = url.hostname;
  } catch {
    hostnameEl.textContent = result.hostname ?? '';
  }

  // Render risk banner
  const color = result.risk?.color ?? 'grey';
  riskBanner.className = BANNER_CLASSES[color] ?? 'banner-scanning';

  const level = result.risk?.level ?? 'error';
  const bannerInfo = getBannerInfo(level, result.findings?.length ?? 0);
  riskIcon.textContent  = bannerInfo.icon;
  riskLabel.textContent = bannerInfo.label;

  // Render findings
  const findings = result.findings ?? [];

  if (findings.length > 0) {
    findingsSection.style.display = 'block';
    findingsCount.textContent = String(findings.length);

    // Sort by weight descending — most severe first
    const sorted = [...findings].sort((a, b) => b.weight - a.weight);

    for (const f of sorted) {
      const li = document.createElement('li');
      li.className = `finding finding-${getSeverityClass(f.weight)}`;

      const idSpan = document.createElement('span');
      idSpan.className = 'finding-id';
      idSpan.textContent = f.id;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'finding-label';
      labelSpan.textContent = f.label;

      const locSpan = document.createElement('span');
      locSpan.className = 'finding-location';
      locSpan.textContent = `in ${f.location}`;

      li.appendChild(idSpan);
      li.appendChild(labelSpan);
      li.appendChild(locSpan);
      findingsList.appendChild(li);
    }
  } else {
    cleanSection.style.display = 'block';
  }

  // Show when scan ran
  if (result.scannedAt) {
    const scannedTime = new Date(result.scannedAt).toLocaleTimeString();
    hostnameEl.title = `Scanned at ${scannedTime}`;
  }
}

function getBannerInfo(level, findingCount) {
  switch (level) {
    case 'safe':    return { icon: '✅', label: 'Clean — No injection patterns detected' };
    case 'info':    return { icon: '✅', label: 'Clean — No injection patterns detected' };
    case 'warning': return { icon: '⚠️', label: `${findingCount} suspicious pattern${findingCount !== 1 ? 's' : ''} — review before sharing` };
    case 'danger':  return { icon: '🔴', label: `${findingCount} injection pattern${findingCount !== 1 ? 's' : ''} — do not share with AI` };
    default:        return { icon: '⏳', label: 'Scanning…' };
  }
}

function getSeverityClass(weight) {
  if (weight >= 9) return 'block';
  if (weight >= 6) return 'warn';
  return 'info';
}

function showError(errorSection, riskBanner, riskIcon, riskLabel) {
  errorSection.style.display = 'block';
  riskBanner.className = 'banner-scanning';
  riskIcon.textContent = '❓';
  riskLabel.textContent = 'Could not retrieve scan result';
}

async function checkPlatformStatus(platformStatus) {
  try {
    const res = await fetch('http://localhost:18791/health', {
      signal: AbortSignal.timeout(400)
    });
    if (res.ok) {
      platformStatus.textContent = '🟢 Platform running';
      platformStatus.className = 'platform-status platform-online';
    }
  } catch {
    platformStatus.textContent = '⚫ Platform offline';
    platformStatus.className = 'platform-status platform-offline';
  }
}

document.addEventListener('DOMContentLoaded', init);
