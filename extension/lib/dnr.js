import { collectBlockedPatterns } from './block-logic.js';
import { isBlockedByBedtime } from './bedtime.js';
import { isProductivitySite } from './categories.js';
import { DNR_RULE_ID } from './constants.js';

/** Serialize DNR updates to prevent concurrent rule ID collisions. */
let refreshQueue = Promise.resolve();

/**
 * Build redirect URL for blocked page.
 * @param {string} extensionId
 * @param {{ categoryId?: string|null, domain?: string, reason?: string }} params
 */
export function buildBlockedPageUrl(extensionId, params = {}) {
  const q = new URLSearchParams();
  if (params.categoryId) q.set('category', params.categoryId);
  if (params.domain) q.set('domain', params.domain);
  if (params.reason) q.set('reason', params.reason);
  const qs = q.toString();
  return `chrome-extension://${extensionId}/blocked/blocked.html${qs ? `?${qs}` : ''}`;
}

/**
 * Convert site pattern to DNR urlFilter.
 * @param {string} pattern
 */
export function patternToUrlFilter(pattern) {
  if (pattern === '__allowlist_catchall__' || pattern === '__bedtime_catchall__') {
    return '*';
  }
  if (pattern.startsWith('*')) return pattern;
  if (pattern.includes('/')) {
    const [host, ...rest] = pattern.split('/');
    return `*://${host}/${rest.join('/')}*`;
  }
  return `*://*.${pattern}/*`;
}

/**
 * Build dynamic DNR rules from settings.
 * @param {import('./constants.js').Settings} settings
 * @param {string} extensionId
 * @returns {chrome.declarativeNetRequest.Rule[]}
 */
export function buildDnrRules(settings, extensionId) {
  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const rules = [];
  let ruleId = DNR_RULE_ID.CATEGORY_BASE;

  const blocked = collectBlockedPatterns(settings);

  if (settings.listMode === 'allowlist') {
    const allowedHosts = new Set([
      ...settings.allowlistAuthDomains,
      ...settings.categories.flatMap((c) => c.sites),
      ...settings.productivitySites,
    ]);

    rules.push({
      id: DNR_RULE_ID.ALLOWLIST_CATCHALL,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          extensionPath: `/blocked/blocked.html?reason=allowlist`,
        },
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame'],
      },
    });

    let excludeId = DNR_RULE_ID.ALLOWLIST_CATCHALL + 1;
    const seenAllow = new Set(['*']);
    for (const host of allowedHosts) {
      if (host.includes('/')) continue;
      const filter = patternToUrlFilter(host);
      if (seenAllow.has(filter)) continue;
      seenAllow.add(filter);
      rules.push({
        id: excludeId++,
        priority: 2,
        action: { type: 'allow' },
        condition: {
          urlFilter: filter,
          resourceTypes: ['main_frame'],
        },
      });
    }
    return rules;
  }

  const seenFilters = new Set();
  for (const entry of blocked) {
    if (entry.pattern === '__bedtime_catchall__') continue;
    if (entry.pattern === '__allowlist_catchall__') continue;

    const urlFilter = patternToUrlFilter(entry.pattern);
    if (seenFilters.has(urlFilter)) continue;
    seenFilters.add(urlFilter);

    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          extensionPath: `/blocked/blocked.html?category=${entry.categoryId || ''}&reason=${entry.reason}&domain=${encodeURIComponent(entry.pattern)}`,
        },
      },
      condition: {
        urlFilter,
        resourceTypes: ['main_frame'],
      },
    });
  }

  if (settings.bedtime.enabled) {
    rules.push({
      id: DNR_RULE_ID.GUARD_BASE,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: '/blocked/blocked.html?reason=bedtime' },
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame'],
      },
    });

    let prodId = DNR_RULE_ID.GUARD_BASE + 1;
    const seenProd = new Set(['*']);
    for (const site of settings.productivitySites) {
      const filter = patternToUrlFilter(site);
      if (seenProd.has(filter)) continue;
      seenProd.add(filter);
      rules.push({
        id: prodId++,
        priority: 2,
        action: { type: 'allow' },
        condition: {
          urlFilter: filter,
          resourceTypes: ['main_frame'],
        },
      });
    }
  }

  return rules;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.declarativeNetRequest|null} dnrApi
 * @param {string} extensionId
 */
export async function refreshDnrRules(settings, dnrApi, extensionId) {
  refreshQueue = refreshQueue
    .then(() => applyDnrRules(settings, dnrApi, extensionId))
    .catch((err) => {
      console.error('WebWarden: DNR refresh failed', err);
    });
  return refreshQueue;
}

/** Reset queue (for tests). */
export function resetDnrRefreshQueue() {
  refreshQueue = Promise.resolve();
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.declarativeNetRequest|null} dnrApi
 * @param {string} extensionId
 */
async function applyDnrRules(settings, dnrApi, extensionId) {
  const api = dnrApi || (typeof chrome !== 'undefined' ? chrome.declarativeNetRequest : null);
  if (!api) return;

  const newRules = buildDnrRules(settings, extensionId);

  const ids = newRules.map((r) => r.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Duplicate DNR rule IDs in batch: ${ids.join(', ')}`);
  }

  const existing = await api.getDynamicRules();
  const removeIds = [...new Set([...existing.map((r) => r.id), ...ids])];

  await api.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: newRules,
  });
}

/**
 * Filter URLs that should redirect during bedtime (non-productivity).
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 */
export function shouldBedtimeRedirect(urlStr, settings) {
  if (!settings.bedtime.enabled) return false;
  if (isProductivitySite(urlStr, settings)) return false;
  return isBlockedByBedtime(urlStr, settings);
}
