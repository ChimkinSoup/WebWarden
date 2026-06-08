import { isTrackedUrl, findCategoryForUrl } from './categories.js';
import { loadSettings } from './storage.js';
import { getEffectiveRemainingMs, getSessionState, restoreSessionFromStorage } from './time-engine.js';
import { MS } from './constants.js';

/** @typedef {'blue' | 'orange' | 'red'} ActionIconState */

const BLUE_ICON = {
  16: 'assets/icons/Blue_Shield-16x16.png',
  32: 'assets/icons/Blue_Shield-32x32.png',
  48: 'assets/icons/Blue_Shield-48x48.png',
};

const ORANGE_ICON = {
  16: 'assets/icons/Orange_Shield-16x16.png',
  32: 'assets/icons/Orange_Shield-32x32.png',
  48: 'assets/icons/Orange_Shield-48x48.png',
};

const RED_ICON = {
  16: 'assets/icons/Red_Shield-16x16.png',
  32: 'assets/icons/Red_Shield-32x32.png',
  48: 'assets/icons/Red_Shield-48x48.png',
};

const ICON_SETS = {
  blue: BLUE_ICON,
  orange: ORANGE_ICON,
  red: RED_ICON,
};

export const LOW_TIME_ICON_THRESHOLD_MS = 5 * MS.MINUTE;

/** @type {ActionIconState|null} */
let lastIconState = null;

/** @type {boolean} */
let devRedIconOverride = false;

/** @type {boolean} */
let devOrangeIconOverride = false;

/**
 * @param {Record<string, string>} map
 * @returns {Record<string, string>}
 */
function resolveIconPaths(map) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return Object.fromEntries(
      Object.entries(map).map(([size, path]) => [size, chrome.runtime.getURL(path)]),
    );
  }
  return map;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {import('./time-engine.js').sessionState} session
 * @returns {number|null}
 */
export function getMinimumDisplayRemainingMs(settings, session) {
  if (!settings.categories.length) return null;

  let min = Infinity;
  for (const cat of settings.categories) {
    const remaining = getEffectiveRemainingMs(cat, session);
    if (remaining < min) min = remaining;
  }
  return min === Infinity ? null : min;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {import('./time-engine.js').sessionState} session
 * @param {{ url?: string, audible?: boolean, active?: boolean }[]} tabs
 * @returns {ActionIconState}
 */
export function resolveActionIconState(settings, session, tabs) {
  if (devOrangeIconOverride) return 'orange';

  const minRemaining = getMinimumDisplayRemainingMs(settings, session);
  if (minRemaining !== null && minRemaining > 0 && minRemaining <= LOW_TIME_ICON_THRESHOLD_MS) {
    return 'orange';
  }

  if (devRedIconOverride || wouldTrackTime(tabs, settings)) return 'red';
  return 'blue';
}

/**
 * Force red toolbar icon while held (developer preview).
 * @param {boolean} forced
 */
export function setDevIconOverride(forced) {
  devRedIconOverride = forced;
  lastIconState = null;
}

/**
 * Force orange toolbar icon (developer preview — same state as low remaining time).
 * @param {boolean} forced
 */
export function setDevOrangeIconOverride(forced) {
  devOrangeIconOverride = forced;
  lastIconState = null;
}

/**
 * Whether screentime would count for active or audible tracked tabs.
 * @param {{ url?: string, audible?: boolean, active?: boolean }[]} tabs
 * @param {import('./constants.js').Settings} settings
 * @returns {boolean}
 */
export function wouldTrackTime(tabs, settings) {
  for (const tab of tabs) {
    if (!tab.url || (!tab.active && !tab.audible)) continue;
    const match = findCategoryForUrl(tab.url, settings);
    if (match && isTrackedUrl(tab.url, settings)) return true;
  }
  return false;
}

/**
 * @param {ActionIconState} state
 * @param {typeof chrome.action|null} [actionApi]
 */
async function applyActionIconState(state, actionApi) {
  const action = actionApi || (typeof chrome !== 'undefined' ? chrome.action : null);
  if (!action?.setIcon) return;

  const paths = resolveIconPaths(ICON_SETS[state]);
  await action.setIcon({ path: paths });
  lastIconState = state;
}

/**
 * Update toolbar icon from remaining time, tracking state, and dev overrides.
 * @param {import('./constants.js').Settings|null} [settings]
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.action|null} [actionApi]
 * @param {{ force?: boolean, session?: import('./time-engine.js').sessionState }} [options]
 */
export async function refreshActionIcon(settings, tabsApi, actionApi, options = {}) {
  const action = actionApi || (typeof chrome !== 'undefined' ? chrome.action : null);
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!action?.setIcon || !tabs?.query) return;

  const s = settings || await loadSettings();
  if (!options.session) {
    await restoreSessionFromStorage();
  }
  const session = options.session || getSessionState();
  const activeTabs = await tabs.query({ active: true });
  const audibleTabs = await tabs.query({ audible: true });
  const state = resolveActionIconState(s, session, [...activeTabs, ...audibleTabs]);
  if (!options.force && state === lastIconState) return;

  try {
    await applyActionIconState(state, action);
  } catch (e) {
    console.error('WebWarden: failed to set toolbar icon', e);
    throw e;
  }
}

/** Reset cached state (for tests). */
export function resetActionIconState() {
  lastIconState = null;
  devRedIconOverride = false;
  devOrangeIconOverride = false;
}

export { BLUE_ICON, ORANGE_ICON, RED_ICON };
