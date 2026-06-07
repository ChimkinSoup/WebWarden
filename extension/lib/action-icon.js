import { isTrackedUrl, findCategoryForUrl } from './categories.js';
import { loadSettings } from './storage.js';

const DEFAULT_ICON = {
  16: 'assets/icons/icon16.png',
  48: 'assets/icons/icon48.png',
  128: 'assets/icons/icon128.png',
};

const ACTIVE_ICON = {
  16: 'assets/icons/icon16-active.png',
  48: 'assets/icons/icon48-active.png',
  128: 'assets/icons/icon128-active.png',
};

const BLINK_ICON_SIZES = [16, 48, 128];
const DEV_TOAST_BLINK_MS = 10_000;
const DEV_TOAST_BLINK_INTERVAL_MS = 500;

/** @type {boolean|null} */
let lastActiveState = null;

/** @type {boolean} */
let devIconOverride = false;

/** @type {ReturnType<typeof setTimeout>|null} */
let devToastBlinkTimer = null;

/** @type {boolean} */
let devToastBlinkVisible = false;

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
 * @param {number} size
 * @returns {ImageData}
 */
export function createOrangeIconImageData(size) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context unavailable');
    }

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, Math.max(1, size / 2 - 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, Math.max(1, size / 3), 0, Math.PI * 2);
    ctx.fill();

    return ctx.getImageData(0, 0, size, size);
  }

  if (typeof ImageData === 'undefined') {
    throw new Error('ImageData unavailable');
  }

  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 136;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  return new ImageData(data, size, size);
}

/**
 * Force red toolbar icon while held (developer preview).
 * @param {boolean} forced
 */
export function setDevIconOverride(forced) {
  devIconOverride = forced;
  lastActiveState = null;
}

/**
 * Whether screentime would count for active or audible tracked tabs.
 * Matches the time engine: background tabs with no audio do not count.
 * @param {{ url?: string, audible?: boolean }[]} tabs
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
 * @param {boolean} active
 * @param {typeof chrome.action|null} [actionApi]
 */
async function applyActionIcon(active, actionApi) {
  const action = actionApi || (typeof chrome !== 'undefined' ? chrome.action : null);
  if (!action?.setIcon) return;

  const paths = resolveIconPaths(active ? ACTIVE_ICON : DEFAULT_ICON);
  await action.setIcon({ path: paths });
  lastActiveState = active;
}

/**
 * @param {typeof chrome.action|null} [actionApi]
 */
async function applyOrangeActionIcon(actionApi) {
  const action = actionApi || (typeof chrome !== 'undefined' ? chrome.action : null);
  if (!action?.setIcon) return;

  /** @type {Record<string, ImageData>} */
  const imageData = {};
  for (const size of BLINK_ICON_SIZES) {
    imageData[String(size)] = createOrangeIconImageData(size);
  }
  await action.setIcon({ imageData });
}

/**
 * Stop the developer 1-minute toast alarm icon blink.
 * @param {typeof chrome.action|null} [actionApi]
 * @param {typeof chrome.tabs|null} [tabsApi]
 */
export async function stopDevOneMinuteToastIconBlink(actionApi, tabsApi) {
  if (devToastBlinkTimer) {
    clearTimeout(devToastBlinkTimer);
    devToastBlinkTimer = null;
  }
  devToastBlinkVisible = false;
  lastActiveState = null;
  await refreshActionIcon(null, tabsApi, actionApi, { force: true });
}

/**
 * Blink the toolbar icon orange when the 1-minute toast alarm fires (developer debug).
 * @param {{ durationMs?: number, intervalMs?: number, actionApi?: typeof chrome.action, tabsApi?: typeof chrome.tabs }} [options]
 */
export function startDevOneMinuteToastIconBlink(options = {}) {
  const durationMs = options.durationMs ?? DEV_TOAST_BLINK_MS;
  const intervalMs = options.intervalMs ?? DEV_TOAST_BLINK_INTERVAL_MS;
  const actionApi = options.actionApi || (typeof chrome !== 'undefined' ? chrome.action : null);
  const tabsApi = options.tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!actionApi?.setIcon) return;

  if (devToastBlinkTimer) {
    clearTimeout(devToastBlinkTimer);
    devToastBlinkTimer = null;
  }

  const startedAt = Date.now();

  const tick = async () => {
    if (Date.now() - startedAt >= durationMs) {
      await stopDevOneMinuteToastIconBlink(actionApi, tabsApi);
      return;
    }

    devToastBlinkVisible = !devToastBlinkVisible;
    try {
      if (devToastBlinkVisible) {
        await applyOrangeActionIcon(actionApi);
      } else {
        lastActiveState = null;
        await refreshActionIcon(null, tabsApi, actionApi, { force: true });
      }
    } catch (e) {
      console.error('WebWarden: failed to blink toolbar icon', e);
    }

    devToastBlinkTimer = setTimeout(tick, intervalMs);
  };

  tick();
}

/**
 * Update toolbar icon when screentime is actively being tracked.
 * @param {import('./constants.js').Settings|null} [settings]
 * @param {typeof chrome.tabs|null} [tabsApi]
 * @param {typeof chrome.action|null} [actionApi]
 * @param {{ force?: boolean }} [options]
 */
export async function refreshActionIcon(settings, tabsApi, actionApi, options = {}) {
  if (devToastBlinkTimer) return;

  const action = actionApi || (typeof chrome !== 'undefined' ? chrome.action : null);
  const tabs = tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!action?.setIcon || !tabs?.query) return;

  const s = settings || await loadSettings();
  const activeTabs = await tabs.query({ active: true });
  const audibleTabs = await tabs.query({ audible: true });
  const active = devIconOverride || wouldTrackTime([...activeTabs, ...audibleTabs], s);

  if (!options.force && active === lastActiveState) return;

  try {
    await applyActionIcon(active, action);
  } catch (e) {
    console.error('WebWarden: failed to set toolbar icon', e);
    throw e;
  }
}

/** Reset cached state (for tests). */
export function resetActionIconState() {
  if (devToastBlinkTimer) {
    clearTimeout(devToastBlinkTimer);
    devToastBlinkTimer = null;
  }
  devToastBlinkVisible = false;
  lastActiveState = null;
  devIconOverride = false;
}
