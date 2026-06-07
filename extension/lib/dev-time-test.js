import { MS } from './constants.js';

export const DEV_TEN_SECOND_TEST_MS = 10 * MS.SECOND;
export const DEV_LIVE_TOAST_TEST_MS = 60 * MS.SECOND + 10 * MS.SECOND;

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {import('./constants.js').Settings}
 */
export function enableDevTenSecondTest(settings) {
  settings.devTenSecondTestSnapshot = Object.fromEntries(
    settings.categories.map((cat) => [cat.id, cat.remainingMs]),
  );
  for (const cat of settings.categories) {
    cat.remainingMs = DEV_TEN_SECOND_TEST_MS;
  }
  settings.devTenSecondTest = true;
  return settings;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {import('./constants.js').Settings}
 */
export function disableDevTenSecondTest(settings) {
  if (settings.devTenSecondTestSnapshot) {
    for (const cat of settings.categories) {
      if (cat.id in settings.devTenSecondTestSnapshot) {
        cat.remainingMs = settings.devTenSecondTestSnapshot[cat.id];
      }
    }
  }
  settings.devTenSecondTest = false;
  settings.devTenSecondTestSnapshot = null;
  return settings;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {boolean} enabled
 * @returns {import('./constants.js').Settings}
 */
export function setDevTenSecondTest(settings, enabled) {
  if (enabled) {
    return enableDevTenSecondTest(settings);
  }
  return disableDevTenSecondTest(settings);
}

/**
 * @param {import('./constants.js').Settings} settings
 */
export function clearDevTenSecondTestIfActive(settings) {
  if (settings.devTenSecondTest) {
    disableDevTenSecondTest(settings);
  }
  return settings;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {import('./constants.js').Settings}
 */
export function enableDevLiveToastTest(settings) {
  settings.devLiveToastTestSnapshot = Object.fromEntries(
    settings.categories.map((cat) => [cat.id, cat.remainingMs]),
  );
  if (settings.categories[0]) {
    settings.categories[0].remainingMs = DEV_LIVE_TOAST_TEST_MS;
  }
  settings.devLiveToastTest = true;
  return settings;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {import('./constants.js').Settings}
 */
export function disableDevLiveToastTest(settings) {
  if (settings.devLiveToastTestSnapshot) {
    for (const cat of settings.categories) {
      if (cat.id in settings.devLiveToastTestSnapshot) {
        cat.remainingMs = settings.devLiveToastTestSnapshot[cat.id];
      }
    }
  }
  settings.devLiveToastTest = false;
  settings.devLiveToastTestSnapshot = null;
  return settings;
}

/**
 * @param {import('./constants.js').Settings} settings
 */
export function clearDevLiveToastTestIfActive(settings) {
  if (settings.devLiveToastTest) {
    disableDevLiveToastTest(settings);
  }
  return settings;
}

/**
 * End active dev tests and restore remaining time to each category daily limit.
 * Used when saving settings while developer mode is on.
 * @param {import('./constants.js').Settings} settings
 */
export function finalizeDeveloperModeSave(settings) {
  clearDevTenSecondTestIfActive(settings);
  clearDevLiveToastTestIfActive(settings);
  for (const cat of settings.categories) {
    cat.remainingMs = cat.dailyLimitMs;
  }
  return settings;
}
