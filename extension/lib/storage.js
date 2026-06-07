import { cloneSettings, createDefaultSettings } from './constants.js';

const STORAGE_KEY = 'webwarden_settings';

/** @type {import('./constants.js').Settings|null} */
let memoryCache = null;

/**
 * @param {typeof chrome.storage.local} storageApi
 */
function getStorageApi(storageApi) {
  return storageApi || (typeof chrome !== 'undefined' ? chrome.storage.local : null);
}

/**
 * @param {typeof chrome.storage.local|null} [storageApi]
 * @returns {Promise<import('./constants.js').Settings>}
 */
export async function loadSettings(storageApi) {
  const api = getStorageApi(storageApi);
  if (memoryCache) return cloneSettings(memoryCache);

  if (!api) {
    memoryCache = createDefaultSettings();
    return cloneSettings(memoryCache);
  }

  const result = await api.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    memoryCache = { ...createDefaultSettings(), ...result[STORAGE_KEY] };
  } else {
    memoryCache = createDefaultSettings();
    await api.set({ [STORAGE_KEY]: memoryCache });
  }
  return cloneSettings(memoryCache);
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.storage.local|null} [storageApi]
 */
export async function saveSettings(settings, storageApi) {
  const api = getStorageApi(storageApi);
  memoryCache = cloneSettings(settings);
  if (api) {
    await api.set({ [STORAGE_KEY]: memoryCache });
  }
  return cloneSettings(memoryCache);
}

/**
 * @param {(settings: import('./constants.js').Settings) => import('./constants.js').Settings|void} mutator
 * @param {typeof chrome.storage.local|null} [storageApi]
 */
export async function updateSettings(mutator, storageApi) {
  const current = await loadSettings(storageApi);
  const next = mutator(current) || current;
  return saveSettings(next, storageApi);
}

/**
 * @param {string} categoryId
 * @param {number} deltaMs
 * @param {typeof chrome.storage.local|null} [storageApi]
 */
export async function deductCategoryTime(categoryId, deltaMs, storageApi) {
  return updateSettings((settings) => {
    const cat = settings.categories.find((c) => c.id === categoryId);
    if (cat) {
      cat.remainingMs = Math.max(0, cat.remainingMs - deltaMs);
    }
    return settings;
  }, storageApi);
}

/**
 * @param {string} categoryId
 * @param {number} addMs
 * @param {typeof chrome.storage.local|null} [storageApi]
 */
export async function addCategoryTime(categoryId, addMs, storageApi) {
  return updateSettings((settings) => {
    const cat = settings.categories.find((c) => c.id === categoryId);
    if (cat) {
      cat.remainingMs += addMs;
    }
    return settings;
  }, storageApi);
}

/** Reset in-memory cache (for tests). */
export function resetStorageCache() {
  memoryCache = null;
}

/**
 * @param {boolean} locked
 * @param {typeof chrome.storage.local|null} [storageApi]
 */
export async function setSettingsLocked(locked, storageApi) {
  return updateSettings((s) => {
    s.settingsLocked = locked;
    return s;
  }, storageApi);
}

/**
 * Update a category daily limit and adjust remaining time accordingly.
 * @param {import('./constants.js').Settings['categories'][0]} cat
 * @param {number} newDailyLimitMs
 */
export function applyCategoryLimitChange(cat, newDailyLimitMs) {
  const oldLimit = cat.dailyLimitMs;
  if (newDailyLimitMs === oldLimit) return;

  cat.dailyLimitMs = newDailyLimitMs;

  if (newDailyLimitMs > oldLimit) {
    if (cat.remainingMs <= 0) {
      cat.remainingMs = newDailyLimitMs;
    } else {
      cat.remainingMs = Math.min(newDailyLimitMs, cat.remainingMs + (newDailyLimitMs - oldLimit));
    }
  } else if (cat.remainingMs > newDailyLimitMs) {
    cat.remainingMs = newDailyLimitMs;
  }
}

/**
 * Merge companion settings into the extension cache without clobbering local config.
 * Extension is the source of truth for limits/sites; companion tracks consumption.
 * @param {import('./constants.js').Settings} local
 * @param {import('./constants.js').Settings} remote
 * @returns {import('./constants.js').Settings}
 */
export function mergeSettingsFromCompanion(local, remote) {
  const merged = { ...local, ...remote, categories: [] };

  const remoteById = new Map((remote.categories || []).map((c) => [c.id, c]));

  for (const localCat of local.categories) {
    const remoteCat = remoteById.get(localCat.id);
    if (!remoteCat) {
      merged.categories.push({ ...localCat });
      continue;
    }

    const cat = {
      ...localCat,
      name: localCat.name,
      sites: [...localCat.sites],
      dailyLimitMs: localCat.dailyLimitMs,
    };

    if (remoteCat.dailyLimitMs === localCat.dailyLimitMs) {
      if (local.devLiveToastTest || local.devTenSecondTest) {
        cat.remainingMs = localCat.remainingMs;
      } else if (localCat.remainingMs <= remoteCat.remainingMs) {
        cat.remainingMs = localCat.remainingMs;
      } else {
        cat.remainingMs = remoteCat.remainingMs;
        if (cat.remainingMs <= 0 && localCat.remainingMs > 0) {
          cat.remainingMs = localCat.remainingMs;
        }
      }
    } else {
      cat.remainingMs = localCat.remainingMs;
    }

    cat.lastResetDate = localCat.lastResetDate ?? remoteCat.lastResetDate ?? null;
    merged.categories.push(cat);
    remoteById.delete(localCat.id);
  }

  for (const remoteCat of remoteById.values()) {
    merged.categories.push({ ...remoteCat });
  }

  merged.developerMode = local.developerMode;
  merged.devTenSecondTest = local.devTenSecondTest;
  merged.devTenSecondTestSnapshot = local.devTenSecondTestSnapshot;
  merged.devLiveToastTest = local.devLiveToastTest;
  merged.devLiveToastTestSnapshot = local.devLiveToastTestSnapshot;
  merged.customQuotes = local.customQuotes?.length ? local.customQuotes : remote.customQuotes;
  merged.customImages = local.customImages?.length ? local.customImages : remote.customImages;
  merged.settingsLocked = local.settingsLocked;
  merged.firstEditDone = local.firstEditDone;
  merged.companionConnected = true;

  return merged;
}

/**
 * @param {import('./constants.js').Settings} incoming
 * @param {{ allowSiteListOnly?: boolean, frictionPassed?: boolean }} opts
 * @returns {boolean}
 */
export function canModifySettings(incoming, opts = {}) {
  if (!incoming.firstEditDone || !incoming.settingsLocked) return true;
  if (opts.allowSiteListOnly) return true;
  return Boolean(opts.frictionPassed);
}

export { enforceCategoriesSiteAddOnly } from './site-list-editor.js';
