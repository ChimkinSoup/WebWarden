import { findCategoryForUrl } from './categories.js';
import { getBlockStatus } from './block-logic.js';
import { extractHostname } from './url-match.js';

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
 */
export async function redirectTabsWithExhaustedTime(settings, tabsApi, runtimeApi) {
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  const runtime = runtimeApi || (typeof chrome !== 'undefined' ? chrome.runtime : null);
  if (!tabs?.update || !runtime?.getURL) return;

  const tabIds = await collectTrackedTabIds(settings, tabs);

  for (const tabId of tabIds) {
    await redirectTabIfBlocked(tabId, settings, tabs, runtime);
  }
}

/**
 * Redirect a tab if its current URL is blocked due to exhausted time.
 * @param {number} tabId
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.runtime|null} [runtimeApi]
 * @returns {Promise<boolean>}
 */
export async function redirectTabIfBlocked(tabId, settings, tabsApi, runtimeApi) {
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
    await tabs.update(tabId, { url: blockedUrl });
    return true;
  } catch {
    return false;
  }
}
