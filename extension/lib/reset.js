import { localDateKey, MS } from './constants.js';

/**
 * @param {number} resetHour
 * @param {Date} now
 * @returns {string}
 */
export function getResetBoundaryDate(resetHour, now = new Date()) {
  const boundary = new Date(now);
  boundary.setHours(resetHour, 0, 0, 0);
  if (now < boundary) {
    boundary.setDate(boundary.getDate() - 1);
  }
  return localDateKey(boundary);
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {Date} [now]
 * @returns {boolean}
 */
export function shouldRunDailyReset(settings, now = new Date()) {
  const boundaryKey = getResetBoundaryDate(settings.resetHour, now);
  return settings.lastGlobalResetDate !== boundaryKey;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {Date} [now]
 * @returns {import('./constants.js').Settings}
 */
export function applyDailyReset(settings, now = new Date()) {
  const boundaryKey = getResetBoundaryDate(settings.resetHour, now);
  if (settings.lastGlobalResetDate === boundaryKey) return settings;

  for (const cat of settings.categories) {
    cat.remainingMs = cat.dailyLimitMs;
    cat.lastResetDate = boundaryKey;
  }
  settings.lastGlobalResetDate = boundaryKey;
  settings.emergencyPauseUsedDate = null;
  settings.emergencyPauseCategoryId = null;
  return settings;
}

/**
 * @param {number} resetHour
 * @param {Date} now
 * @returns {number} ms until next reset
 */
export function msUntilNextReset(resetHour, now = new Date()) {
  const next = new Date(now);
  next.setHours(resetHour, 0, 0, 0);
  if (now >= next) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}
