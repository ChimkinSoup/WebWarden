import { deductCategoryTime, loadSettings, saveSettings } from './storage.js';
import { findConsumingTab } from './categories.js';
import { scheduleSessionAlarms, clearSessionAlarms } from './alarms.js';
import { sendMessage } from './native-port.js';
import { redirectTabsWithExhaustedTime } from './tab-redirect.js';

const SESSION_STORAGE_KEY = 'webwarden_active_session';

/** @type {{ isConsumingTime: boolean, activeCategoryId: string|null, sessionStartMs: number|null, activeDomain: string|null, activeTabId: number|null, sessionBaseRemainingMs: number|null }} */
export const sessionState = {
  isConsumingTime: false,
  activeCategoryId: null,
  sessionStartMs: null,
  activeDomain: null,
  activeTabId: null,
  sessionBaseRemainingMs: null,
};

let idleLocked = false;

/**
 * @returns {typeof sessionState}
 */
export function getSessionState() {
  return { ...sessionState };
}

/** Reset session state (for tests). */
export function resetSessionState() {
  sessionState.isConsumingTime = false;
  sessionState.activeCategoryId = null;
  sessionState.sessionStartMs = null;
  sessionState.activeDomain = null;
  sessionState.activeTabId = null;
  sessionState.sessionBaseRemainingMs = null;
  idleLocked = false;
}

/**
 * @param {import('./constants.js').Settings['categories'][0]} cat
 * @param {typeof sessionState} [session]
 * @returns {number}
 */
export function getEffectiveRemainingMs(cat, session = sessionState) {
  if (!session.isConsumingTime || session.activeCategoryId !== cat.id || !session.sessionStartMs) {
    return cat.remainingMs;
  }
  return Math.max(0, cat.remainingMs - (Date.now() - session.sessionStartMs));
}

/**
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
async function persistSession(storageApi) {
  const api = storageApi || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
  if (!api) return;

  if (sessionState.isConsumingTime) {
    await api.set({ [SESSION_STORAGE_KEY]: { ...sessionState } });
  } else {
    await api.remove(SESSION_STORAGE_KEY);
  }
}

/**
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function restoreSessionFromStorage(storageApi) {
  if (sessionState.isConsumingTime) return sessionState;

  const api = storageApi || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
  if (!api) return sessionState;

  const result = await api.get(SESSION_STORAGE_KEY);
  const persisted = result[SESSION_STORAGE_KEY];
  if (persisted?.isConsumingTime) {
    sessionState.isConsumingTime = persisted.isConsumingTime;
    sessionState.activeCategoryId = persisted.activeCategoryId;
    sessionState.sessionStartMs = persisted.sessionStartMs;
    sessionState.activeDomain = persisted.activeDomain;
    sessionState.activeTabId = persisted.activeTabId ?? null;
    sessionState.sessionBaseRemainingMs = persisted.sessionBaseRemainingMs ?? null;
  }
  return sessionState;
}

/**
 * End current consumption session and sync.
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function stopConsumption(alarmsApi, storageApi) {
  if (!sessionState.isConsumingTime || !sessionState.sessionStartMs) {
    sessionState.isConsumingTime = false;
    await persistSession(storageApi);
    return;
  }

  const deltaMs = Date.now() - sessionState.sessionStartMs;
  const categoryId = sessionState.activeCategoryId;
  const domain = sessionState.activeDomain;

  sessionState.isConsumingTime = false;
  sessionState.activeCategoryId = null;
  sessionState.sessionStartMs = null;
  sessionState.activeDomain = null;
  sessionState.activeTabId = null;
  sessionState.sessionBaseRemainingMs = null;

  const api = alarmsApi || (typeof chrome !== 'undefined' ? chrome.alarms : null);
  if (api) await clearSessionAlarms(api);

  if (categoryId && deltaMs > 0) {
    await deductCategoryTime(categoryId, deltaMs);
    sendMessage({
      type: 'SYNC_SESSION',
      categoryId,
      domain: domain || '',
      deltaMs,
      timestamp: Date.now(),
    }).catch(() => {});
  }

  await persistSession(storageApi);
}

/**
 * Start consumption for a matched tab.
 * @param {{ categoryId: string, domain: string, tabId?: number|null }} match
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function startConsumption(match, settings, alarmsApi, storageApi) {
  const cat = settings.categories.find((c) => c.id === match.categoryId);
  if (!cat || cat.remainingMs <= 0) return;

  if (sessionState.isConsumingTime && sessionState.activeCategoryId === match.categoryId) {
    const effectiveRemaining = getEffectiveRemainingMs(cat);
    if (effectiveRemaining <= 0) {
      await handleTimeUp(undefined, alarmsApi, storageApi);
      return;
    }
    if (match.tabId != null) {
      sessionState.activeTabId = match.tabId;
    }
    if (match.domain) {
      sessionState.activeDomain = match.domain;
    }
    const baseRemaining = sessionState.sessionBaseRemainingMs ?? cat.remainingMs;
    if (cat.remainingMs > baseRemaining + 1000) {
      sessionState.sessionStartMs = Date.now();
      sessionState.sessionBaseRemainingMs = cat.remainingMs;
      await scheduleSessionAlarms(match.categoryId, cat.remainingMs, cat.dailyLimitMs, alarmsApi);
      await persistSession(storageApi);
      return;
    }
    await scheduleSessionAlarms(match.categoryId, effectiveRemaining, cat.dailyLimitMs, alarmsApi);
    await persistSession(storageApi);
    return;
  }

  if (sessionState.isConsumingTime) {
    await stopConsumption(alarmsApi, storageApi);
  }

  sessionState.isConsumingTime = true;
  sessionState.activeCategoryId = match.categoryId;
  sessionState.sessionStartMs = Date.now();
  sessionState.activeDomain = match.domain;
  sessionState.activeTabId = match.tabId ?? null;
  sessionState.sessionBaseRemainingMs = cat.remainingMs;

  await scheduleSessionAlarms(match.categoryId, cat.remainingMs, cat.dailyLimitMs, alarmsApi);
  await persistSession(storageApi);
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function checkAndHandleExpiredSession(settings, alarmsApi, tabsApi, storageApi) {
  if (!sessionState.isConsumingTime || !sessionState.activeCategoryId || !sessionState.sessionStartMs) {
    return false;
  }

  const cat = settings.categories.find((c) => c.id === sessionState.activeCategoryId);
  if (!cat) return false;

  if (getEffectiveRemainingMs(cat) <= 0) {
    await handleTimeUp(tabsApi, alarmsApi, storageApi);
    return true;
  }
  return false;
}

/**
 * Re-evaluate active tabs and update consumption state.
 * @param {typeof chrome.tabs|null} tabsApi
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function evaluateActiveConsumption(tabsApi, alarmsApi, storageApi) {
  if (idleLocked) {
    return;
  }

  await restoreSessionFromStorage(storageApi);

  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!tabs) return;

  const settings = await loadSettings();

  if (await checkAndHandleExpiredSession(settings, alarmsApi, tabs, storageApi)) {
    return;
  }

  const activeTabs = await tabs.query({ active: true });
  const audibleTabs = await tabs.query({ audible: true });
  const allTabs = [...activeTabs, ...audibleTabs];

  const match = findConsumingTab(allTabs, settings);

  if (match) {
    await startConsumption(match, settings, alarmsApi, storageApi);
  } else if (sessionState.isConsumingTime) {
    await stopConsumption(alarmsApi, storageApi);
  }
}

/**
 * Handle idle state change.
 * @param {string} state
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function handleIdleStateChange(state, alarmsApi, storageApi) {
  if (state === 'locked') {
    idleLocked = true;
    await stopConsumption(alarmsApi, storageApi);
    return;
  }
  if (state === 'active') {
    idleLocked = false;
    await evaluateActiveConsumption(undefined, alarmsApi, storageApi);
  }
}

/**
 * Handle time-up alarm: zero category and redirect tabs.
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function handleTimeUp(tabsApi, alarmsApi, storageApi) {
  await restoreSessionFromStorage(storageApi);

  const categoryId = sessionState.activeCategoryId;
  const domain = sessionState.activeDomain;
  await stopConsumption(alarmsApi, storageApi);

  const settings = await loadSettings();
  if (categoryId) {
    const cat = settings.categories.find((c) => c.id === categoryId);
    if (cat) cat.remainingMs = 0;
    await saveSettings(settings);
  }

  sendMessage({
    type: 'SYNC_SESSION',
    categoryId: categoryId || '',
    domain: domain || '',
    deltaMs: 0,
    timestamp: Date.now(),
    event: 'time_limit_hit',
  }).catch(() => {});

  const settings2 = await loadSettings();
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : null;
  await redirectTabsWithExhaustedTime(settings2, tabs, runtime);
}
