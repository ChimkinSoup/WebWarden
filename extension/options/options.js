import {
  generateChallenge,
  validateChar,
  acceptsDevBypassChar,
  isDevBypassComplete,
  isFrictionChallengePassed,
  DEV_BYPASS_PHRASE,
} from '../lib/friction.js';
import { MS } from '../lib/constants.js';
import { applyCategoryLimitChange } from '../lib/storage.js';
import { mergeSitesAllowAddOnly } from '../lib/site-list-editor.js';
import { formatBootTimeMs } from '../lib/restart-response.js';

/** @type {object|null} */
let settings = null;
let unlockRestartVerified = false;
let unlockChallenge = generateChallenge();
let unlockTyped = '';
let unlockChallengeResetting = false;
/** @type {number|null} */
let pageToastTimer = null;

async function init() {
  await chrome.runtime.sendMessage({ type: 'REFRESH_GUARD' });
  const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  settings = resp.settings;
  renderCategories();
  populateGlobalFields();
  updateLockState();
  updateDeveloperPanel();
  updateGuardBanner();
  loadAnalytics();
  bindEvents();
  bindRuntimeMessages();
}

function bindRuntimeMessages() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SHOW_TIME_TOAST') return;
    showPageToast(message.message, message.variant || 'warning');
    sendResponse({ ok: true });
    return true;
  });
}

async function updateGuardBanner() {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  const banner = document.getElementById('guard-banner');
  if (status.guardActive && status.guardReason) {
    banner.hidden = false;
    banner.textContent = `Guard mode active: ${status.guardReason}`;
  } else if (status.guardActive) {
    banner.hidden = false;
    banner.textContent = 'Guard mode active: blocking tracked sites until incognito access and the companion app are both ready.';
  } else {
    banner.hidden = true;
  }
}

function isSettingsFormLocked() {
  return Boolean(
    settings?.settingsLocked
    && settings?.firstEditDone
    && !settings?.developerMode
    && !isFrictionChallengePassed(unlockTyped),
  );
}

function clearUnlockSession() {
  unlockTyped = '';
  unlockRestartVerified = false;
}

function renderCategorySitesField(cat, siteAddOnly) {
  if (!siteAddOnly) {
    return `
      <label>Sites (one domain per line)
        <textarea class="cat-sites" rows="3">${escapeHtml(cat.sites.join('\n'))}</textarea>
      </label>`;
  }

  const siteItems = cat.sites.length
    ? cat.sites.map((site) => `<li>${escapeHtml(site)}</li>`).join('')
    : '<li class="site-list-empty">No sites yet</li>';

  return `
    <div class="cat-sites-block">
      <span class="field-label">Sites</span>
      <ul class="site-list-readonly" aria-label="Locked site list">${siteItems}</ul>
      <label class="field site-add-field">
        Add domain
        <input class="cat-site-add" type="text" placeholder="example.com" spellcheck="false" autocomplete="off" />
      </label>
      <p class="hint site-add-hint">Existing domains are locked. Type a new domain and press Enter to add it.</p>
      <p class="hint site-add-feedback" aria-live="polite"></p>
    </div>`;
}

function renderCategories() {
  const container = document.getElementById('categories-list');
  const siteAddOnly = isSettingsFormLocked();
  const fullyEditable = !siteAddOnly;
  container.innerHTML = '';

  for (const cat of settings.categories) {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.dataset.id = cat.id;
    card.innerHTML = `
      <h3>${escapeHtml(cat.name)}</h3>
      <label class="field-lockable">Name <input class="cat-name" value="${escapeAttr(cat.name)}" data-protected /></label>
      <label class="field-lockable">Daily limit (minutes) <input class="cat-limit" type="number" min="1" value="${Math.round(cat.dailyLimitMs / MS.MINUTE)}" data-protected /></label>
      ${renderCategorySitesField(cat, siteAddOnly)}
      <p class="hint">Remaining: ${formatMs(cat.remainingMs)}</p>
      ${fullyEditable && settings.categories.length > 1 ? '<button type="button" class="btn btn-danger btn-remove-cat field-lockable">Remove</button>' : ''}
    `;
    container.appendChild(card);
  }
}

function populateGlobalFields() {
  document.getElementById('list-mode').value = settings.listMode;
  document.getElementById('reset-hour').value = settings.resetHour;
  document.getElementById('extra-restart-min').value = Math.round(settings.extraTimeOnRestartMs / MS.MINUTE);
  document.getElementById('emergency-min').value = Math.round(settings.emergencyPauseMs / MS.MINUTE);
  document.getElementById('bedtime-enabled').checked = settings.bedtime.enabled;
  document.getElementById('bedtime-start').value = settings.bedtime.start;
  document.getElementById('bedtime-end').value = settings.bedtime.end;
  document.getElementById('bedtime-hardcore').checked = settings.bedtime.hardcore;
  document.getElementById('productivity-sites').value = settings.productivitySites.join('\n');
  document.getElementById('custom-quotes').value = (settings.customQuotes || []).join('\n');
  document.getElementById('custom-images').value = (settings.customImages || []).join('\n');
}

function updateLockState() {
  const locked = isSettingsFormLocked();
  const main = document.querySelector('main');
  const addBtn = document.getElementById('btn-add-category');

  document.getElementById('lock-banner').hidden = !locked;
  main?.classList.toggle('settings-locked', locked);

  document.querySelectorAll('[data-protected]').forEach((el) => {
    el.disabled = locked;
  });

  if (addBtn) {
    addBtn.disabled = locked;
  }

  if (settings.developerMode) {
    main?.classList.remove('settings-locked');
    document.querySelectorAll('[data-protected], .cat-name, .cat-limit').forEach((el) => {
      el.disabled = false;
    });
    if (addBtn) addBtn.disabled = false;
  }
}

function updateDeveloperPanel() {
  const enabled = Boolean(settings.developerMode);
  document.getElementById('dev-disabled').hidden = enabled;
  document.getElementById('dev-enabled').hidden = !enabled;
  updateTenSecondTestButton();
}

function updateTenSecondTestButton() {
  const btn = document.getElementById('btn-toggle-10s-test');
  if (!btn || !settings) return;
  const active = Boolean(settings.devTenSecondTest);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.textContent = active ? '10s Block Test: On' : '10s Block Test: Off';
  btn.classList.toggle('btn-primary', active);
  btn.classList.toggle('btn-secondary', !active);
}

function bindEvents() {
  document.getElementById('btn-save').addEventListener('click', saveSettings);
  document.getElementById('btn-add-category').addEventListener('click', addCategory);
  document.getElementById('btn-unlock').addEventListener('click', openUnlockModal);
  document.getElementById('btn-close-unlock').addEventListener('click', closeUnlockModal);
  document.getElementById('unlock-modal').addEventListener('click', (e) => {
    if (e.target.id === 'unlock-modal') closeUnlockModal();
  });
  document.getElementById('btn-verify-restart-unlock').addEventListener('click', verifyRestartUnlock);
  document.getElementById('btn-enable-dev').addEventListener('click', () => setDeveloperMode(true));
  document.getElementById('btn-disable-dev').addEventListener('click', () => setDeveloperMode(false));
  document.getElementById('btn-check-restart').addEventListener('click', checkRestartValidity);
  document.getElementById('btn-simulate-restart').addEventListener('click', simulateRestart);
  document.getElementById('btn-toast-5').addEventListener('click', () => showDevToast(5));
  document.getElementById('btn-toast-1').addEventListener('click', () => showDevToast(1));
  document.getElementById('btn-live-toast').addEventListener('click', startLiveToastTest);
  document.getElementById('btn-toggle-10s-test').addEventListener('click', toggleTenSecondBlockTest);
  bindDevIconHoldButton();
  document.getElementById('page-toast-dismiss').addEventListener('click', hidePageToast);

  document.getElementById('unlock-challenge').addEventListener('keydown', (e) => {
    if (!unlockRestartVerified || unlockChallengeResetting) return;
    if (getUnlockChallengeBox()?.getAttribute('aria-disabled') === 'true') return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); return; }
    if (e.key.length === 1) { e.preventDefault(); handleUnlockChar(e.key); }
  });

  document.getElementById('categories-list').addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-remove-cat')) return;
    if (isSettingsFormLocked()) return;
    const card = e.target.closest('.category-card');
    settings.categories = settings.categories.filter((c) => c.id !== card.dataset.id);
    renderCategories();
    updateLockState();
  });

  document.getElementById('categories-list').addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('cat-site-add')) return;
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitCategorySiteAdd(e.target.closest('.category-card'), e.target);
  });
}

function showSiteAddFeedback(card, message, isError = false) {
  const el = card?.querySelector('.site-add-feedback');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('site-add-feedback-error', isError);
  if (!isError && message) {
    window.setTimeout(() => {
      if (el.textContent === message) el.textContent = '';
    }, 2500);
  }
}

async function persistSiteAddOnlySettings() {
  const devMode = settings.developerMode;
  return chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings,
    fullEdit: false,
    frictionPassed: devMode || isFrictionChallengePassed(unlockTyped),
    markFirstEdit: false,
    frictionToken: isFrictionChallengePassed(unlockTyped) ? unlockTyped : null,
  });
}

async function submitCategorySiteAdd(card, input) {
  if (!card || !input || !isSettingsFormLocked()) return;

  const cat = settings.categories.find((c) => c.id === card.dataset.id);
  if (!cat) return;

  const domain = input.value.trim();
  if (!domain) {
    showSiteAddFeedback(card, 'Enter a domain first.', true);
    return;
  }

  const merged = mergeSitesAllowAddOnly(cat.sites, [domain]);
  if (merged.length === cat.sites.length) {
    showSiteAddFeedback(card, 'That domain is already in the list.', true);
    return;
  }

  const previousSites = [...cat.sites];
  cat.sites = merged;

  const resp = await persistSiteAddOnlySettings();
  if (resp.ok) {
    settings = resp.settings;
    const catId = cat.id;
    renderCategories();
    updateLockState();
    const updatedCard = document.querySelector(`.category-card[data-id="${catId}"]`);
    updatedCard?.querySelector('.cat-site-add')?.focus();
    showSiteAddFeedback(updatedCard, `Added ${domain}.`);
    return;
  }

  cat.sites = previousSites;
  showSiteAddFeedback(card, resp.error || 'Failed to add domain.', true);
}

function hidePageToast() {
  const toast = document.getElementById('page-toast');
  if (!toast) return;
  toast.classList.remove('is-visible');
  if (pageToastTimer) {
    window.clearTimeout(pageToastTimer);
    pageToastTimer = null;
  }
  window.setTimeout(() => {
    if (!toast.classList.contains('is-visible')) {
      toast.hidden = true;
    }
  }, 280);
}

/**
 * @param {string} message
 * @param {'success'|'error'|'warning'} [type]
 */
function showPageToast(message, type = 'success') {
  const toast = document.getElementById('page-toast');
  const messageEl = document.getElementById('page-toast-message');
  const titleEl = document.getElementById('page-toast-title');
  if (!toast || !messageEl) return;

  if (pageToastTimer) {
    window.clearTimeout(pageToastTimer);
    pageToastTimer = null;
  }

  messageEl.textContent = message;
  toast.classList.remove('page-toast-success', 'page-toast-error', 'page-toast-warning');
  if (type === 'error') {
    toast.classList.add('page-toast-error');
  } else if (type === 'warning') {
    toast.classList.add('page-toast-warning');
  } else {
    toast.classList.add('page-toast-success');
  }
  if (titleEl) {
    titleEl.hidden = type !== 'warning';
  }
  toast.hidden = false;
  toast.classList.add('is-visible');

  const duration = type === 'error' ? 6000 : (type === 'warning' ? 5000 : 3500);
  pageToastTimer = window.setTimeout(hidePageToast, duration);
}

async function saveSettings() {
  collectFormData();

  const devMode = settings.developerMode;
  const locked = isSettingsFormLocked();
  const resp = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings,
    fullEdit: !locked,
    frictionPassed: devMode || isFrictionChallengePassed(unlockTyped),
    markFirstEdit: !devMode && !settings.firstEditDone,
    frictionToken: isFrictionChallengePassed(unlockTyped) ? unlockTyped : null,
  });

  if (resp.ok) {
    settings = resp.settings;
    if (!settings.developerMode) {
      clearUnlockSession();
    }
    renderCategories();
    updateLockState();
    showPageToast('Settings saved.');
  } else {
    showPageToast(resp.error || 'Failed to save', 'error');
  }
}

function collectFormData() {
  const canEditAll = !isSettingsFormLocked();
  const siteAddOnly = isSettingsFormLocked();

  if (canEditAll) {
    settings.listMode = document.getElementById('list-mode').value;
    settings.resetHour = Number(document.getElementById('reset-hour').value);
    settings.extraTimeOnRestartMs = Number(document.getElementById('extra-restart-min').value) * MS.MINUTE;
    settings.emergencyPauseMs = Number(document.getElementById('emergency-min').value) * MS.MINUTE;
    settings.bedtime = {
      enabled: document.getElementById('bedtime-enabled').checked,
      start: document.getElementById('bedtime-start').value,
      end: document.getElementById('bedtime-end').value,
      hardcore: document.getElementById('bedtime-hardcore').checked,
    };
    settings.productivitySites = document.getElementById('productivity-sites').value.split('\n').map((s) => s.trim()).filter(Boolean);
    settings.customQuotes = document.getElementById('custom-quotes').value.split('\n').map((s) => s.trim()).filter(Boolean);
    settings.customImages = document.getElementById('custom-images').value.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  document.querySelectorAll('.category-card').forEach((card) => {
    const id = card.dataset.id;
    const cat = settings.categories.find((c) => c.id === id);
    if (!cat) return;

    if (canEditAll) {
      const textarea = card.querySelector('.cat-sites');
      cat.sites = textarea.value.split('\n').map((s) => s.trim()).filter(Boolean);
      cat.name = card.querySelector('.cat-name').value;
      const limitMin = Number(card.querySelector('.cat-limit').value);
      applyCategoryLimitChange(cat, limitMin * MS.MINUTE);
    } else if (siteAddOnly) {
      const addInput = card.querySelector('.cat-site-add');
      const newSite = addInput?.value.trim();
      if (newSite) {
        cat.sites = mergeSitesAllowAddOnly(cat.sites, [newSite]);
      }
    }
  });
}

function addCategory() {
  if (isSettingsFormLocked()) return;
  const limitMs = 60 * MS.MINUTE;
  settings.categories.push({
    id: `cat-${Date.now()}`,
    name: 'New Category',
    sites: [],
    dailyLimitMs: limitMs,
    remainingMs: limitMs,
    lastResetDate: null,
  });
  renderCategories();
  updateLockState();
}

function openUnlockModal() {
  unlockRestartVerified = false;
  unlockChallengeResetting = false;
  unlockChallenge = generateChallenge();
  unlockTyped = '';
  document.getElementById('restart-unlock-status').textContent = '';
  const box = getUnlockChallengeBox();
  box?.classList.remove('challenge-shake', 'challenge-error');
  setUnlockChallengeEnabled(false);
  renderUnlockChallenge();
  document.getElementById('unlock-modal').hidden = false;
}

function closeUnlockModal() {
  document.getElementById('unlock-modal').hidden = true;
}

async function setDeveloperMode(enabled) {
  const resp = await chrome.runtime.sendMessage({ type: 'SET_DEVELOPER_MODE', enabled });
  if (resp.ok) {
    settings = resp.settings;
    renderCategories();
    updateLockState();
    updateDeveloperPanel();
    if (enabled) {
      document.getElementById('dev-restart-status').textContent = '';
      document.getElementById('dev-toast-status').textContent = '';
      document.getElementById('dev-10s-test-status').textContent = '';
    } else {
      document.getElementById('dev-10s-test-status').textContent = '';
    }
  }
}

async function showDevToast(minutes) {
  const status = document.getElementById('dev-toast-status');
  const resp = await chrome.runtime.sendMessage({ type: 'DEV_SHOW_TOAST', minutes });
  if (resp.ok) {
    if (resp.message) {
      showPageToast(resp.message, 'warning');
    }
    status.textContent = `Showed ${minutes}-minute test toast.`;
    status.className = 'status-box success';
  } else {
    status.textContent = resp.error || 'Failed to show toast';
    status.className = 'status-box error';
  }
}

async function startLiveToastTest() {
  const status = document.getElementById('dev-toast-status');
  status.textContent = 'Starting live test...';
  status.className = 'status-box';
  const resp = await chrome.runtime.sendMessage({ type: 'DEV_START_LIVE_TOAST' });
  if (resp.ok) {
    status.textContent = resp.message;
    status.className = resp.consuming ? 'status-box success' : 'status-box';
  } else {
    status.textContent = resp.error || 'Live test failed';
    status.className = 'status-box error';
  }
}

async function toggleTenSecondBlockTest() {
  const status = document.getElementById('dev-10s-test-status');
  const btn = document.getElementById('btn-toggle-10s-test');
  const enabling = !settings.devTenSecondTest;
  status.textContent = enabling ? 'Enabling 10s block test…' : 'Restoring remaining time…';
  status.className = 'status-box';

  const resp = await chrome.runtime.sendMessage({
    type: 'DEV_TOGGLE_TEN_SECOND_TEST',
    enabled: enabling,
  });

  if (resp.ok) {
    settings = resp.settings;
    renderCategories();
    updateTenSecondTestButton();
    status.textContent = resp.message;
    status.className = 'status-box success';
  } else {
    status.textContent = resp.error || 'Failed to toggle 10s block test';
    status.className = 'status-box error';
    updateTenSecondTestButton();
  }

  if (btn) btn.blur();
}

function formatRestartStatus(resp, { dryRun = false } = {}) {
  const boot = formatBootTimeMs(resp.bootTimeMs);
  const last = resp.lastBootTimeMs
    ? formatBootTimeMs(resp.lastBootTimeMs)
    : 'never recorded';

  if (resp.granted) {
    const prefix = dryRun
      ? 'Restart WOULD be accepted (dry run — token not updated).'
      : 'Restart token reset for dev testing. Verify-restart unlock should succeed now.';
    return `${prefix}\nCurrent boot: ${boot}\nLast recorded boot: ${last}`;
  }

  return `Restart NOT detected since last token.\nCurrent boot: ${boot}\nLast recorded boot: ${last}`;
}

async function checkRestartValidity() {
  const status = document.getElementById('dev-restart-status');
  status.textContent = 'Checking with companion...';
  status.className = 'status-box';

  const resp = await chrome.runtime.sendMessage({ type: 'CHECK_RESTART' });
  if (!resp.ok) {
    status.textContent = `Error: ${resp.error || 'Companion unreachable'}`;
    status.className = 'status-box error';
    return;
  }

  status.textContent = formatRestartStatus(resp, { dryRun: true });
  status.className = resp.granted ? 'status-box success' : 'status-box error';
}

async function simulateRestart() {
  const status = document.getElementById('dev-restart-status');
  status.textContent = 'Simulating restart...';
  status.className = 'status-box';

  const resp = await chrome.runtime.sendMessage({ type: 'DEV_SIMULATE_RESTART' });
  if (!resp.ok) {
    status.textContent = `Error: ${resp.error || 'Companion unreachable'}`;
    status.className = 'status-box error';
    return;
  }

  status.textContent = formatRestartStatus(resp);
  status.className = 'status-box success';
}

function bindDevIconHoldButton() {
  const btn = document.getElementById('btn-hold-red-icon');
  const status = document.getElementById('dev-icon-status');
  if (!btn) return;

  let holding = false;
  /** @type {Promise<void>} */
  let overrideQueue = Promise.resolve();

  const enqueueOverride = (forced) => {
    overrideQueue = overrideQueue.then(async () => {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'DEV_SET_ICON_OVERRIDE',
          forced,
        });
        if (!resp?.ok) {
          if (status) {
            status.textContent = resp?.error || 'Failed to update toolbar icon';
            status.className = 'status-box error';
          }
          return;
        }
        if (status && forced) {
          status.textContent = 'Toolbar icon is red while held.';
          status.className = 'status-box success';
        } else if (status && !forced) {
          status.textContent = '';
          status.className = 'status-box';
        }
      } catch (e) {
        if (status) {
          status.textContent = e.message || 'Failed to reach extension background';
          status.className = 'status-box error';
        }
      }
    });
    return overrideQueue;
  };

  const press = (e) => {
    if (holding || btn.disabled) return;
    e.preventDefault();
    holding = true;
    btn.classList.add('is-pressed');
    if (e.pointerId !== undefined && btn.setPointerCapture) {
      btn.setPointerCapture(e.pointerId);
    }
    enqueueOverride(true);
  };

  const release = () => {
    if (!holding) return;
    holding = false;
    btn.classList.remove('is-pressed');
    enqueueOverride(false);
  };

  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    press(e);
  });
  btn.addEventListener('mouseup', release);
  btn.addEventListener('mouseleave', release);
  window.addEventListener('mouseup', release);
  btn.addEventListener('blur', release);
}

async function verifyRestartUnlock() {
  const status = document.getElementById('restart-unlock-status');
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'VERIFY_RESTART',
      categoryId: settings.categories[0]?.id,
    });
    if (!resp.ok) {
      status.textContent = resp.error || 'Could not verify restart with companion.';
      return;
    }
    if (resp.granted) {
      unlockRestartVerified = true;
      status.textContent = 'Restart verified. Complete the typing challenge.';
      setUnlockChallengeEnabled(true);
    } else {
      status.textContent = 'Restart not detected. Please restart your laptop.';
    }
  } catch (e) {
    status.textContent = e.message;
  }
}

function getUnlockChallengeBox() {
  return document.getElementById('unlock-challenge');
}

function setUnlockChallengeEnabled(enabled) {
  const box = getUnlockChallengeBox();
  if (!box) return;
  box.tabIndex = enabled ? 0 : -1;
  box.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  if (enabled) {
    box.focus();
  }
}

function renderUnlockChallenge({ error = false, wrongChar = null } = {}) {
  const box = getUnlockChallengeBox();
  if (!box) return;

  let html = '';
  const showCaret = !error && unlockTyped.length < unlockChallenge.length;
  const devPrefix = unlockTyped.length > 0 && DEV_BYPASS_PHRASE.startsWith(unlockTyped);

  if (error && wrongChar) {
    for (let i = 0; i < unlockTyped.length; i++) {
      html += `<span class="challenge-char typed">${escapeHtml(unlockChallenge[i])}</span>`;
    }
    html += `<span class="challenge-char wrong-char">${escapeHtml(wrongChar)}</span>`;
    for (let i = unlockTyped.length + 1; i < unlockChallenge.length; i++) {
      html += `<span class="challenge-char">${escapeHtml(unlockChallenge[i])}</span>`;
    }
  } else if (devPrefix && unlockTyped.length <= DEV_BYPASS_PHRASE.length) {
    for (const ch of unlockTyped) {
      html += `<span class="challenge-char typed">${escapeHtml(ch)}</span>`;
    }
    if (showCaret && !isDevBypassComplete(unlockTyped)) {
      html += '<span class="challenge-caret" aria-hidden="true"></span>';
    }
    for (let i = 0; i < unlockChallenge.length; i++) {
      html += `<span class="challenge-char challenge-char-remaining">${escapeHtml(unlockChallenge[i])}</span>`;
    }
  } else {
    for (let i = 0; i < unlockChallenge.length; i++) {
      if (showCaret && i === unlockTyped.length) {
        html += '<span class="challenge-caret" aria-hidden="true"></span>';
      }
      const classes = ['challenge-char'];
      if (i < unlockTyped.length) classes.push('typed');
      html += `<span class="${classes.join(' ')}">${escapeHtml(unlockChallenge[i])}</span>`;
    }
  }

  box.innerHTML = html;
  box.classList.toggle('challenge-error', error);
}

function completeUnlockChallenge() {
  updateLockState();
  renderCategories();
  closeUnlockModal();
}

function failUnlockChallenge(wrongChar) {
  if (unlockChallengeResetting) return;
  unlockChallengeResetting = true;

  const box = getUnlockChallengeBox();

  renderUnlockChallenge({ error: true, wrongChar });
  setUnlockChallengeEnabled(false);
  box?.classList.add('challenge-shake');

  window.setTimeout(() => {
    box?.classList.remove('challenge-shake', 'challenge-error');
    unlockTyped = '';
    unlockChallenge = generateChallenge();
    renderUnlockChallenge();
    unlockChallengeResetting = false;
    if (unlockRestartVerified) {
      setUnlockChallengeEnabled(true);
    }
  }, 480);
}

function handleUnlockChar(char) {
  if (acceptsDevBypassChar(unlockTyped, char)) {
    unlockTyped += char;
    renderUnlockChallenge();
    if (isDevBypassComplete(unlockTyped)) {
      completeUnlockChallenge();
    }
    return;
  }

  if (!validateChar(unlockChallenge, unlockTyped.length, char)) {
    failUnlockChallenge(char);
    return;
  }

  unlockTyped += char;
  renderUnlockChallenge();
  if (unlockTyped.length === 100) {
    completeUnlockChallenge();
  }
}

async function loadAnalytics() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_ANALYTICS' });
  const a = resp.analytics || {};
  document.getElementById('analytics-display').innerHTML = `
    Restarts: ${a.restarts ?? 0}<br>
    Time limit hits: ${a.timeLimitHits ?? 0}<br>
    Emergency pauses: ${a.emergencyPauses ?? 0}<br>
    Bedtime challenges: ${a.bedtimeChallenges ?? 0}<br>
    Total sessions: ${a.totalSessions ?? 0}
  `;
}

function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;');
}

init();
