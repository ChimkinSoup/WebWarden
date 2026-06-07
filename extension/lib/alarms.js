import { ALARM_NAMES, MS } from './constants.js';

/**
 * @param {number} remainingMs
 * @param {number} dailyLimitMs
 * @returns {{ name: string, delayMs: number }[]}
 */
export function computeToastAlarms(remainingMs, dailyLimitMs) {
  /** @type {{ name: string, delayMs: number }[]} */
  const alarms = [];

  const thresholds = [
    { name: ALARM_NAMES.TOAST_1, offset: MS.MINUTE },
    { name: ALARM_NAMES.TOAST_5, offset: 5 * MS.MINUTE },
    { name: ALARM_NAMES.TOAST_30, offset: 30 * MS.MINUTE },
  ];

  for (const { name, offset } of thresholds) {
    if (name === ALARM_NAMES.TOAST_30 && dailyLimitMs < MS.HOUR) continue;
    if (remainingMs > offset) {
      alarms.push({ name, delayMs: remainingMs - offset });
    }
  }
  return alarms;
}

/**
 * @param {string} categoryId
 * @param {number} remainingMs
 * @param {number} dailyLimitMs
 * @param {typeof chrome.alarms|null} alarmsApi
 */
export async function scheduleSessionAlarms(categoryId, remainingMs, dailyLimitMs, alarmsApi) {
  const api = alarmsApi || (typeof chrome !== 'undefined' ? chrome.alarms : null);
  if (!api) return;

  await clearSessionAlarms(api);

  if (remainingMs <= 0) return;

  const now = Date.now();
  await api.create(ALARM_NAMES.TIME_UP, { when: now + remainingMs });

  const toasts = computeToastAlarms(remainingMs, dailyLimitMs);
  for (const t of toasts) {
    await api.create(t.name, { when: now + t.delayMs });
  }
}

/**
 * @param {typeof chrome.alarms} alarmsApi
 */
export async function clearSessionAlarms(alarmsApi) {
  const names = [
    ALARM_NAMES.TIME_UP,
    ALARM_NAMES.TOAST_30,
    ALARM_NAMES.TOAST_5,
    ALARM_NAMES.TOAST_1,
  ];
  for (const name of names) {
    await alarmsApi.clear(name);
  }
}

/**
 * @param {string} alarmName
 * @returns {number|null} minutes remaining for toast, or null if timeUp
 */
export function toastMinutesForAlarm(alarmName) {
  switch (alarmName) {
    case ALARM_NAMES.TOAST_30: return 30;
    case ALARM_NAMES.TOAST_5: return 5;
    case ALARM_NAMES.TOAST_1: return 1;
    default: return null;
  }
}

/**
 * @param {number} minutes
 * @param {string|null|undefined} categoryName
 * @returns {string}
 */
export function formatRemainingToastMessage(minutes, categoryName) {
  const unit = minutes === 1 ? 'minute' : 'minutes';
  const scope = categoryName ? ` in ${categoryName}` : ' in this category';
  return `${minutes} ${unit} remaining${scope}.`;
}

/**
 * @returns {string|undefined}
 */
export function getNotificationIconUrl() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('assets/icons/icon128.png');
  }
  return undefined;
}

/**
 * @param {number} minutes
 * @param {string} message
 * @param {typeof chrome.notifications|null} notificationsApi
 */
export async function showSystemRemainingToast(minutes, message, notificationsApi) {
  const api = notificationsApi || (typeof chrome !== 'undefined' ? chrome.notifications : null);
  if (!api) return;

  /** @type {chrome.notifications.NotificationOptions<true>} */
  const options = {
    type: 'basic',
    title: 'WebWarden',
    message,
    priority: 2,
  };

  const iconUrl = getNotificationIconUrl();
  if (iconUrl) {
    options.iconUrl = iconUrl;
  }

  await api.create(`toast-${minutes}-${Date.now()}`, options);
}

/**
 * @param {number} tabId
 * @param {string} message
 * @param {{ tabsApi?: typeof chrome.tabs, scriptingApi?: typeof chrome.scripting, runtimeApi?: typeof chrome.runtime }} deps
 * @returns {Promise<boolean>}
 */
async function tryShowToastOnTab(tabId, message, deps) {
  const tabsApi = deps.tabsApi;
  const scriptingApi = deps.scriptingApi;
  const runtimeApi = deps.runtimeApi;
  if (!tabsApi?.get) return false;

  let tab;
  try {
    tab = await tabsApi.get(tabId);
  } catch {
    return false;
  }

  if (!tab?.id || !tab.url) return false;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    return false;
  }

  const extensionOrigin = runtimeApi?.getURL ? runtimeApi.getURL('') : null;
  const isExtensionPage = Boolean(extensionOrigin && tab.url.startsWith(extensionOrigin));

  const tryTabMessage = async () => {
    if (!tabsApi.sendMessage) return false;
    try {
      const response = await tabsApi.sendMessage(tab.id, {
        type: 'SHOW_TIME_TOAST',
        message,
        variant: 'warning',
      });
      return Boolean(response?.ok);
    } catch {
      return false;
    }
  };

  const invokeToastFunc = async () => {
    if (!scriptingApi?.executeScript) return false;
    try {
      const results = await scriptingApi.executeScript({
        target: { tabId: tab.id },
        func: (msg, variant) => {
          if (typeof globalThis.__webwardenShowToast === 'function') {
            globalThis.__webwardenShowToast(msg, variant);
            return true;
          }
          return false;
        },
        args: [message, 'warning'],
      });
      return results?.[0]?.result === true;
    } catch {
      return false;
    }
  };

  const ensureToastScript = async () => {
    if (!scriptingApi?.executeScript) return;
    try {
      await scriptingApi.executeScript({
        target: { tabId: tab.id },
        files: ['content/time-toast.js'],
      });
    } catch {
      /* manifest content script may already be present */
    }
  };

  if (!isExtensionPage && (await tryTabMessage())) {
    return true;
  }

  await ensureToastScript();

  if (await tryTabMessage()) {
    return true;
  }

  return invokeToastFunc();
}

/**
 * @param {string} message
 * @param {{ tabId?: number|null, domain?: string|null, tabsApi?: typeof chrome.tabs, scriptingApi?: typeof chrome.scripting, runtimeApi?: typeof chrome.runtime }} [deps]
 * @returns {Promise<boolean>}
 */
export async function tryShowInPageRemainingToast(message, deps = {}) {
  const tabsApi = deps.tabsApi || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!tabsApi?.query) return false;

  /** @type {number[]} */
  const candidateIds = [];
  const addId = (id) => {
    if (typeof id === 'number' && !candidateIds.includes(id)) {
      candidateIds.push(id);
    }
  };

  addId(deps.tabId ?? undefined);

  try {
    const focused = await tabsApi.query({ active: true, lastFocusedWindow: true });
    for (const tab of focused) addId(tab.id);

    const audible = await tabsApi.query({ audible: true });
    for (const tab of audible) addId(tab.id);

    if (deps.domain) {
      for (const pattern of [`*://*.${deps.domain}/*`, `*://${deps.domain}/*`]) {
        try {
          const matched = await tabsApi.query({ url: pattern });
          for (const tab of matched) addId(tab.id);
        } catch {
          /* ignore invalid pattern */
        }
      }
    }
  } catch {
    return false;
  }

  for (const tabId of candidateIds) {
    if (await tryShowToastOnTab(tabId, message, deps)) return true;
  }
  return false;
}

/**
 * Show a themed in-page toast for remaining time.
 * @param {number} minutes
 * @param {{ categoryName?: string|null, tabId?: number|null, domain?: string|null, tabsApi?: typeof chrome.tabs, scriptingApi?: typeof chrome.scripting, runtimeApi?: typeof chrome.runtime }} [opts]
 */
export async function showRemainingToast(minutes, opts = {}) {
  const message = formatRemainingToastMessage(minutes, opts.categoryName);
  await tryShowInPageRemainingToast(message, opts);
}
