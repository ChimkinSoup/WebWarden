import { findCategoryForUrl, isAllowedInAllowlistMode } from './categories.js';
import { isBlockedByBedtime, isHardcoreBedtime } from './bedtime.js';
import { extractHostname } from './url-match.js';

/**
 * @typedef {'time-up'|'bedtime'|'guard'|null} BlockReason
 */

/**
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 * @returns {{ blocked: boolean, reason: BlockReason, categoryId: string|null }}
 */
export function getBlockStatus(urlStr, settings) {
  const hostname = extractHostname(urlStr);
  if (!hostname) return { blocked: false, reason: null, categoryId: null };

  if (settings.guardActive) {
    return { blocked: true, reason: 'guard', categoryId: null };
  }

  if (settings.listMode === 'allowlist' && !isAllowedInAllowlistMode(urlStr, settings)) {
    const match = findCategoryForUrl(urlStr, settings);
    return { blocked: true, reason: 'time-up', categoryId: match?.categoryId ?? null };
  }

  const match = findCategoryForUrl(urlStr, settings);
  if (!match && settings.listMode === 'blocklist') {
    return { blocked: false, reason: null, categoryId: null };
  }

  if (isBlockedByBedtime(urlStr, settings)) {
    return { blocked: true, reason: 'bedtime', categoryId: match?.categoryId ?? null };
  }

  if (match) {
    const cat = settings.categories.find((c) => c.id === match.categoryId);
    if (cat && cat.remainingMs <= 0) {
      return { blocked: true, reason: 'time-up', categoryId: cat.id };
    }
  }

  if (settings.listMode === 'allowlist' && !isAllowedInAllowlistMode(urlStr, settings)) {
    return { blocked: true, reason: 'time-up', categoryId: match?.categoryId ?? null };
  }

  return { blocked: false, reason: null, categoryId: match?.categoryId ?? null };
}

/**
 * Collect all host patterns that should be blocked given current settings.
 * @param {import('./constants.js').Settings} settings
 * @returns {{ pattern: string, categoryId: string|null, reason: string }[]}
 */
export function collectBlockedPatterns(settings) {
  /** @type {{ pattern: string, categoryId: string|null, reason: string }[]} */
  const patterns = [];

  if (settings.guardActive) {
    for (const cat of settings.categories) {
      for (const site of cat.sites) {
        patterns.push({ pattern: site, categoryId: cat.id, reason: 'guard' });
      }
    }
    if (settings.listMode === 'allowlist') {
      patterns.push({ pattern: '*', categoryId: null, reason: 'guard' });
    }
    return patterns;
  }

  if (settings.listMode === 'allowlist') {
    patterns.push({ pattern: '__allowlist_catchall__', categoryId: null, reason: 'allowlist' });
    return patterns;
  }

  for (const cat of settings.categories) {
    const timeExhausted = cat.remainingMs <= 0;

    for (const site of cat.sites) {
      if (timeExhausted) {
        patterns.push({ pattern: site, categoryId: cat.id, reason: 'time-up' });
      }
    }
  }

  if (settings.bedtime.enabled) {
    patterns.push({ pattern: '__bedtime_catchall__', categoryId: null, reason: 'bedtime' });
  }

  return patterns;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {string} categoryId
 */
export function canUseEmergencyPause(settings, categoryId) {
  if (isHardcoreBedtime(settings)) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (settings.emergencyPauseUsedDate === today) return false;
  const cat = settings.categories.find((c) => c.id === categoryId);
  if (!cat || cat.remainingMs > 0) return false;
  return true;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {string} categoryId
 */
export function canUseRestart(settings, categoryId) {
  if (isHardcoreBedtime(settings)) return false;
  return Boolean(categoryId);
}
