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
    return chrome.runtime.getURL('assets/icons/Blue_Shield-48x48.png');
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
 * Show a Windows notification for remaining time warnings.
 * @param {number} minutes
 * @param {{ categoryName?: string|null, notificationsApi?: typeof chrome.notifications }} [opts]
 */
export async function showRemainingToast(minutes, opts = {}) {
  const message = formatRemainingToastMessage(minutes, opts.categoryName);
  await showSystemRemainingToast(minutes, message, opts.notificationsApi);
}
