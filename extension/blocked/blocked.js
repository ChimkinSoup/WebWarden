import { PRESET_QUOTES } from '../lib/constants.js';
import { generateChallenge, validateChar } from '../lib/friction.js';
import { canUseEmergencyPause, canUseRestart } from '../lib/block-logic.js';
import { isBedtimeActive, isHardcoreBedtime } from '../lib/bedtime.js';
import { isProductivitySite } from '../lib/categories.js';
import { bindExtensionPageToast } from '../lib/extension-page-toast.js';

const params = new URLSearchParams(location.search);
const categoryId = params.get('category') || '';
const domain = params.get('domain') || '';
const reason = params.get('reason') || 'time-up';

let settings = null;
/** @type {object|null} */
let debugInfo = null;
let challenge = generateChallenge();
let typed = '';

async function init() {
  bindExtensionPageToast();
  const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  settings = resp.settings;

  showRandomContent();
  updateReasonLabel();
  setupButtons();
  setupChallenge();
  setupDebugActions();
  await refreshDebugContent();
}

async function refreshDebugContent() {
  const panel = document.getElementById('debug-panel');
  const content = document.getElementById('debug-content');
  const restoreBtn = document.getElementById('btn-restore-dev-time');
  try {
    debugInfo = await chrome.runtime.sendMessage({
      type: 'GET_BLOCK_DEBUG',
      domain,
      categoryId,
      reason,
    });
    content.textContent = formatDebugText(debugInfo);
    restoreBtn.hidden = true;
    if (debugInfo.developerMode) {
      panel.open = true;
      if (debugInfo.category?.remainingMs <= 0 && (reason === 'time-up' || debugInfo.blockStatus?.reason === 'time-up')) {
        restoreBtn.hidden = false;
      }
    }
  } catch (e) {
    content.textContent = `Failed to load debug info: ${e.message}`;
  }
}

function setupDebugActions() {
  document.getElementById('btn-restore-dev-time').addEventListener('click', async () => {
    const status = document.getElementById('debug-action-status');
    status.textContent = 'Restoring…';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'DEV_RESTORE_CATEGORY_TIME',
        categoryId: categoryId || debugInfo?.category?.id,
      });
      if (resp.ok) {
        status.textContent = `Restored ${formatMs(resp.remainingMs)}. Open the site in a new tab.`;
        status.className = 'status-box success';
        await refreshDebugContent();
      } else {
        status.textContent = resp.error || 'Restore failed';
      }
    } catch (e) {
      status.textContent = e.message;
    }
  });

  document.getElementById('btn-copy-debug').addEventListener('click', async () => {
    const content = document.getElementById('debug-content');
    const payload = debugInfo ? JSON.stringify(debugInfo, null, 2) : content.textContent;
    await navigator.clipboard.writeText(payload);
    document.getElementById('debug-action-status').textContent = 'Copied to clipboard.';
  });

  document.getElementById('btn-refresh-blocking').addEventListener('click', async () => {
    const status = document.getElementById('debug-action-status');
    status.textContent = 'Refreshing…';
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'REFRESH_BLOCKING' });
      if (resp.ok) {
        settings = resp.settings;
        await refreshDebugContent();
        status.textContent = 'Blocking rules refreshed. Try the site again in a new tab.';
        status.className = 'status-box success';
      } else {
        status.textContent = resp.error || 'Refresh failed';
      }
    } catch (e) {
      status.textContent = e.message;
    }
  });
}

function formatMs(ms) {
  if (ms <= 0) return '0m';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDebugText(info) {
  const lines = [
    `Redirect reason (URL): ${info.query.reason || reason}`,
    `Domain (URL): ${info.query.domain || domain || '(none)'}`,
    `Category (URL): ${info.query.categoryId || categoryId || '(none)'}`,
    '',
    `Guard active: ${info.guardActive}`,
    info.guardReason ? `Guard detail: ${info.guardReason}` : null,
    `Companion connected: ${info.companionConnected}`,
    `Incognito allowed: ${info.incognitoAllowed}`,
    `Developer mode: ${info.developerMode}`,
    `List mode: ${info.listMode}`,
    `Bedtime active: ${info.bedtimeActive}`,
    info.bedtime?.enabled ? `Bedtime window: ${info.bedtime.start} – ${info.bedtime.end}` : null,
    '',
    info.blockStatus
      ? `Live block check: blocked=${info.blockStatus.blocked}, reason=${info.blockStatus.reason || 'none'}`
      : 'Live block check: (no domain to test)',
    '',
    'Categories:',
    ...info.categories.map(
      (c) => `  • ${c.name} (${c.id}): limit ${formatMs(c.dailyLimitMs)}, remaining ${formatMs(c.remainingMs)}`,
    ),
  ];

  if (info.category) {
    lines.push(
      '',
      `Matched category: ${info.category.name}`,
      `  dailyLimitMs: ${info.category.dailyLimitMs}`,
      `  remainingMs: ${info.category.remainingMs}`,
      `  sites: ${info.category.sites.join(', ')}`,
    );
  }

  lines.push(
    '',
    `DNR block patterns: ${info.dnrBlockPatternCount}`,
    info.matchingPatterns?.length
      ? `Patterns for this domain: ${info.matchingPatterns.map((p) => `${p.pattern} (${p.reason})`).join(', ')}`
      : 'Patterns for this domain: (none matched by name)',
  );

  if (info.session) {
    lines.push(
      '',
      `Active session: consuming=${info.session.isConsumingTime}`,
      info.session.activeCategoryId ? `  category=${info.session.activeCategoryId}` : null,
      info.session.activeDomain ? `  domain=${info.session.activeDomain}` : null,
    );
  }

  return lines.filter(Boolean).join('\n');
}

function showRandomContent() {
  const allQuotes = [...PRESET_QUOTES, ...(settings.customQuotes || [])];
  const allImages = settings.customImages || [];
  const useImage = allImages.length > 0 && Math.random() > 0.5;

  if (useImage) {
    const img = allImages[Math.floor(Math.random() * allImages.length)];
    document.getElementById('image-view').hidden = false;
    document.getElementById('block-image').src = img;
  } else {
    document.getElementById('quote-view').hidden = false;
    const quote = allQuotes[Math.floor(Math.random() * allQuotes.length)];
    document.getElementById('quote-text').textContent = quote;
  }
}

function updateReasonLabel() {
  const labels = {
    'time-up': 'Your allotted time for this category has run out.',
    bedtime: 'Bedtime mode is active.',
    guard: 'WebWarden guard is active. Enable incognito access or start the companion app.',
    allowlist: 'This site is not on your allow list.',
  };
  let text = labels[reason] || labels['time-up'];
  if (domain) text += ` (${domain})`;
  document.getElementById('reason-label').textContent = text;
}

function setupButtons() {
  const btnRestart = document.getElementById('btn-restart');
  const btnEmergency = document.getElementById('btn-emergency');
  const bedtime = isBedtimeActive(settings);
  const hardcore = isHardcoreBedtime(settings);

  if (!bedtime && !hardcore && categoryId && canUseRestart(settings, categoryId)) {
    btnRestart.hidden = false;
    btnRestart.addEventListener('click', () => {
      document.getElementById('restart-modal').hidden = false;
    });
  }

  if (!hardcore && categoryId && canUseEmergencyPause(settings, categoryId)) {
    btnEmergency.hidden = false;
    btnEmergency.addEventListener('click', async () => {
      const resp = await chrome.runtime.sendMessage({
        type: 'EMERGENCY_PAUSE',
        categoryId,
      });
      if (resp.ok) {
        btnEmergency.disabled = true;
        btnEmergency.textContent = 'Restoring tabs…';
      } else {
        alert(resp.error || 'Emergency pause unavailable');
      }
    });
  }

  document.getElementById('btn-verify-restart').addEventListener('click', async () => {
    const status = document.getElementById('restart-status');
    status.textContent = 'Verifying restart...';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'VERIFY_RESTART',
        categoryId,
      });
      if (resp.granted) {
        status.textContent = 'Extra time granted! Redirecting...';
        status.className = 'status-box success';
        setTimeout(() => { location.href = 'https://www.google.com'; }, 1500);
      } else {
        status.textContent = 'Restart not detected. Please restart your laptop first.';
        status.className = 'status-box error';
      }
    } catch (e) {
      status.textContent = e.message;
      status.className = 'status-box error';
    }
  });

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('restart-modal').hidden = true;
  });

  document.getElementById('restart-modal').addEventListener('click', (e) => {
    if (e.target.id === 'restart-modal') {
      document.getElementById('restart-modal').hidden = true;
    }
  });
}

function setupChallenge() {
  const panel = document.getElementById('bedtime-challenge');
  if (reason !== 'bedtime' || !domain) return;

  const testUrl = `https://${domain}/`;
  if (!isProductivitySite(testUrl, settings) || isHardcoreBedtime(settings)) return;

  panel.hidden = false;
  renderChallenge();

  const input = document.getElementById('challenge-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      handleChar(e.key);
    }
  });
}

function renderChallenge() {
  const display = document.getElementById('challenge-display');
  let html = '';
  for (let i = 0; i < challenge.length; i++) {
    const cls = i < typed.length ? 'typed' : '';
    html += `<span class="${cls}">${challenge[i]}</span>`;
  }
  display.innerHTML = html;
}

async function handleChar(char) {
  if (!validateChar(challenge, typed.length, char)) {
    typed = '';
    challenge = generateChallenge();
    document.getElementById('challenge-input').value = '';
    renderChallenge();
    return;
  }
  typed += char;
  document.getElementById('challenge-input').value = typed;
  renderChallenge();

  if (typed.length === 100) {
    const resp = await chrome.runtime.sendMessage({
      type: 'BEDTIME_CHALLENGE',
      categoryId: categoryId || settings.categories[0]?.id,
    });
    if (resp.ok) {
      location.href = `https://${domain}/`;
    }
  }
}

init();
