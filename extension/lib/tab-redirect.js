import { findCategoryForUrl } from './categories.js';
import { getBlockStatus } from './block-logic.js';
import { extractHostname } from './url-match.js';

const BLOCKED_TAB_RETURNS_KEY = 'webwarden_blocked_tab_returns';

export const DEFAULT_NEW_TAB_URL = 'chrome://newtab/';

/**
 * @param {string|null|undefined} categoryId
 * @param {string|null|undefined} domain
 * @param {typeof chrome.runtime|null} [runtimeApi]
 */
export function buildTimeUpBlockedUrl(categoryId, domain, runtimeApi) {
  const runtime = runtimeApi || (typeof chrome !== 'undefined' ? chrome.runtime : null);
  const q = new URLSearchParams({ reason: 'time-up' });
  if (categoryId) q.set('category', categoryId);
  if (domain) q.set('domain', domain);
  return runtime.getURL(`blocked/blocked.html?${q.toString()}`);
}

/**
 * @param {typeof chrome.storage.session|null|undefined} [storageApi]
 * @returns {Promise<Record<string, string>>}
 */
async function loadBlockedTabReturns(storageApi) {
  const api = storageApi || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
  if (!api) return {};

  const result = await api.get(BLOCKED_TAB_RETURNS_KEY);
  return result[BLOCKED_TAB_RETURNS_KEY] || {};
}

/**
 * @param {number} tabId
 * @param {string} returnUrl
 * @param {typeof chrome.storage.session|null|undefined} [storageApi]
 */
export async function rememberBlockedTabReturnUrl(tabId, returnUrl, storageApi) {
  if (!returnUrl || returnUrl.startsWith('chrome-extension://')) return;

  const api = storageApi || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
  if (!api) return;

  const returns = await loadBlockedTabReturns(api);
  returns[String(tabId)] = returnUrl;
  await api.set({ [BLOCKED_TAB_RETURNS_KEY]: returns });
}

/**
 * @param {number} tabId
 * @param {typeof chrome.storage.session|null|undefined} [storageApi]
 */
export async function forgetBlockedTabReturn(tabId, storageApi) {
  const api = storageApi || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
  if (!api) return;

  const returns = await loadBlockedTabReturns(api);
  if (!(String(tabId) in returns)) return;

  delete returns[String(tabId)];
  await api.set({ [BLOCKED_TAB_RETURNS_KEY]: returns });
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {string[]}
 */
export function trackedSiteUrlPatterns(settings) {
  const patterns = new Set();
  for (const site of settings.categories.flatMap((cat) => cat.sites)) {
    const host = site.split('/')[0].replace(/^www\./, '').toLowerCase();
    if (!host || host.includes('*')) continue;
    patterns.add(`*://*.${host}/*`);
    patterns.add(`*://${host}/*`);
  }
  return [...patterns];
}

/**
 * Find tab ids for tracked sites, including tabs whose url is unavailable in bulk query.
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @returns {Promise<number[]>}
 */
export async function collectTrackedTabIds(settings, tabsApi) {
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!tabs?.query) return [];

  /** @type {Set<number>} */
  const ids = new Set();

  for (const pattern of trackedSiteUrlPatterns(settings)) {
    try {
      const matched = await tabs.query({ url: pattern });
      for (const tab of matched) {
        if (tab.id !== undefined) ids.add(tab.id);
      }
    } catch {
      /* ignore invalid patterns */
    }
  }

  const all = await tabs.query({});
  for (const tab of all) {
    if (tab.id === undefined) continue;
    let url = tab.url || tab.pendingUrl;
    if (!url) {
      try {
        const full = await tabs.get(tab.id);
        url = full.url || full.pendingUrl;
      } catch {
        continue;
      }
    }
    if (url && findCategoryForUrl(url, settings)) {
      ids.add(tab.id);
    }
  }

  return [...ids];
}

/**
 * Redirect every open tab that should be blocked for exhausted category time.
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.runtime|null} [runtimeApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 */
export async function redirectTabsWithExhaustedTime(settings, tabsApi, runtimeApi, storageApi) {
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  const runtime = runtimeApi || (typeof chrome !== 'undefined' ? chrome.runtime : null);
  if (!tabs?.update || !runtime?.getURL) return;

  const tabIds = await collectTrackedTabIds(settings, tabs);

  for (const tabId of tabIds) {
    await redirectTabIfBlocked(tabId, settings, tabs, runtime, storageApi);
  }
}

/**
 * Redirect a tab if its current URL is blocked due to exhausted time.
 * @param {number} tabId
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.runtime|null} [runtimeApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 * @returns {Promise<boolean>}
 */
export async function redirectTabIfBlocked(tabId, settings, tabsApi, runtimeApi, storageApi) {
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  const runtime = runtimeApi || (typeof chrome !== 'undefined' ? chrome.runtime : null);
  if (!tabs?.get || !tabs?.update || !runtime?.getURL) return false;

  let tab;
  try {
    tab = await tabs.get(tabId);
  } catch {
    return false;
  }

  const url = tab.url || tab.pendingUrl;
  if (!url || url.startsWith('chrome-extension://')) return false;

  const status = getBlockStatus(url, settings);
  if (!status.blocked || status.reason !== 'time-up') return false;

  const domain = extractHostname(url) || '';
  const blockedUrl = buildTimeUpBlockedUrl(status.categoryId, domain, runtime);

  try {
    await rememberBlockedTabReturnUrl(tabId, url, storageApi);
    await tabs.update(tabId, { url: blockedUrl });
    return true;
  } catch {
    return false;
  }
}

/**
 * Restore tabs on the time-up block page after emergency pause.
 * Uses the saved pre-block URL when available; otherwise opens a new tab page.
 * @param {string} categoryId
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.runtime|null} [runtimeApi]
 * @param {typeof chrome.storage.session|null} [storageApi]
 * @returns {Promise<{ tabId: number, url: string }[]>}
 */
export async function restoreBlockedTabsAfterEmergencyPause(categoryId, tabsApi, runtimeApi, storageApi) {
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  const runtime = runtimeApi || (typeof chrome !== 'undefined' ? chrome.runtime : null);
  const storage = storageApi || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
  if (!tabs?.query || !tabs?.update || !runtime?.getURL) return [];

  const extensionOrigin = runtime.getURL('');
  /** @type {{ id?: number, url?: string }[]} */
  let blockedTabs = [];

  try {
    blockedTabs = await tabs.query({ url: `${extensionOrigin}blocked/blocked.html*` });
  } catch {
    const allTabs = await tabs.query({});
    blockedTabs = allTabs.filter((tab) => tab.url?.includes('/blocked/blocked.html'));
  }

  const returns = await loadBlockedTabReturns(storage);
  /** @type {{ tabId: number, url: string }[]} */
  const restored = [];

  for (const tab of blockedTabs) {
    if (tab.id === undefined || !tab.url) continue;

    let params;
    try {
      params = new URL(tab.url).searchParams;
    } catch {
      continue;
    }

    if (params.get('reason') !== 'time-up') continue;
    if (categoryId && (params.get('category') || '') !== categoryId) continue;

    const returnUrl = returns[String(tab.id)] || DEFAULT_NEW_TAB_URL;
    try {
      await tabs.update(tab.id, { url: returnUrl });
      restored.push({ tabId: tab.id, url: returnUrl });
      delete returns[String(tab.id)];
    } catch {
      /* ignore individual tab failures */
    }
  }

  if (storage) {
    await storage.set({ [BLOCKED_TAB_RETURNS_KEY]: returns });
  }

  return restored;
}
