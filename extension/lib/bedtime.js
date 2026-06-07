import { isProductivitySite } from './categories.js';

/**
 * Parse "HH:MM" to minutes since midnight.
 * @param {string} timeStr
 */
export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isBedtimeActive(settings, now = new Date()) {
  if (!settings.bedtime.enabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(settings.bedtime.start);
  const end = timeToMinutes(settings.bedtime.end);
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {Date} [now]
 */
export function isHardcoreBedtime(settings, now) {
  return settings.bedtime.enabled && settings.bedtime.hardcore && isBedtimeActive(settings, now);
}

/**
 * @param {string} urlStr
 * @param {import('./constants.js').Settings} settings
 * @returns {boolean}
 */
export function isBlockedByBedtime(urlStr, settings) {
  if (!isBedtimeActive(settings)) return false;
  return !isProductivitySite(urlStr, settings);
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {'bedtime'|null}
 */
export function bedtimeBlockReason(settings) {
  if (isBedtimeActive(settings)) return 'bedtime';
  return null;
}
