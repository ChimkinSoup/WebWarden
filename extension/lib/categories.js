import { urlMatchesAny, extractHostname } from './url-match.js';

/**
 * @typedef {{ categoryId: string, categoryName: string, domain: string, url: string }} MatchResult
 */

/**
 * Find which category a URL belongs to based on site lists.
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 * @returns {MatchResult|null}
 */
export function findCategoryForUrl(urlStr, settings) {
  const hostname = extractHostname(urlStr);
  if (!hostname) return null;

  for (const cat of settings.categories) {
    if (urlMatchesAny(urlStr, cat.sites)) {
      return { categoryId: cat.id, categoryName: cat.name, domain: hostname, url: urlStr };
    }
  }
  return null;
}

/**
 * Check if URL is on the auth allowlist (allowlist mode safety).
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 */
export function isAuthDomain(urlStr, settings) {
  return urlMatchesAny(urlStr, settings.allowlistAuthDomains);
}

/**
 * Check if URL is on productivity list.
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 */
export function isProductivitySite(urlStr, settings) {
  return urlMatchesAny(urlStr, settings.productivitySites);
}

/**
 * In allowlist mode, is this URL allowed to be visited?
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 */
export function isAllowedInAllowlistMode(urlStr, settings) {
  if (isAuthDomain(urlStr, settings)) return true;
  if (findCategoryForUrl(urlStr, settings)) return true;
  const allAllowed = settings.categories.flatMap((c) => c.sites);
  return urlMatchesAny(urlStr, allAllowed);
}

/**
 * Should this URL count toward screentime consumption?
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 */
export function isTrackedUrl(urlStr, settings) {
  if (settings.listMode === 'blocklist') {
    return findCategoryForUrl(urlStr, settings) !== null;
  }
  return findCategoryForUrl(urlStr, settings) !== null;
}

/**
 * Pick the best match from active/audible tabs.
 * @param {{ id?: number, url?: string, audible?: boolean }[]} tabs
 * @param {import('./constants.js').Settings} settings
 * @returns {(MatchResult & { tabId: number|null })|null}
 */
export function findConsumingTab(tabs, settings) {
  for (const tab of tabs) {
    if (!tab.url) continue;
    const match = findCategoryForUrl(tab.url, settings);
    if (match && isTrackedUrl(tab.url, settings)) {
      return { ...match, tabId: tab.id ?? null };
    }
  }
  return null;
}
