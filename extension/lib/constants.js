/** @typedef {{ id: string, name: string, sites: string[], dailyLimitMs: number, remainingMs: number, lastResetDate: string|null }} Category */

/** @typedef {{ enabled: boolean, start: string, end: string, hardcore: boolean }} Bedtime */

/**
 * @typedef {Object} Settings
 * @property {string} listMode
 * @property {number} resetHour
 * @property {string[]} allowlistAuthDomains
 * @property {number} extraTimeOnRestartMs
 * @property {number} emergencyPauseMs
 * @property {string|null} emergencyPauseUsedDate
 * @property {string|null} emergencyPauseCategoryId
 * @property {boolean} settingsLocked
 * @property {boolean} firstEditDone
 * @property {boolean} companionConnected
 * @property {boolean} incognitoAllowed
 * @property {boolean} guardActive
 * @property {boolean} developerMode
 * @property {boolean} devTenSecondTest
 * @property {Record<string, number>|null} devTenSecondTestSnapshot
 * @property {boolean} devLiveToastTest
 * @property {Record<string, number>|null} devLiveToastTestSnapshot
 * @property {string|null} lastGlobalResetDate
 * @property {Bedtime} bedtime
 * @property {string[]} productivitySites
 * @property {string[]} customQuotes
 * @property {string[]} customImages
 * @property {Category[]} categories
 */

export const DEFAULT_AUTH_DOMAINS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
  'github.com',
  'auth0.com',
  'okta.com',
  'login.live.com',
];

export const PRESET_QUOTES = [
  'The best time to plant a tree was 20 years ago. The second best time is now.',
  'Discipline is choosing between what you want now and what you want most.',
  'You have power over your mind — not outside events.',
  'Small steps every day lead to big changes over time.',
  'Rest is productive when it is intentional.',
];

export const MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
};

export const NATIVE_HOST = 'com.webwarden.companion';

export const ALARM_NAMES = {
  RECONNECT: 'companion-reconnect',
  RESET_CHECK: 'reset-check',
  TIME_UP: 'timeUp',
  TOAST_30: 'remaining-30',
  TOAST_5: 'remaining-5',
  TOAST_1: 'remaining-1',
};

export const DNR_RULE_ID = {
  GUARD_BASE: 1,
  CATEGORY_BASE: 1000,
  ALLOWLIST_CATCHALL: 9000,
};

/**
 * @returns {Settings}
 */
export function createDefaultSettings() {
  const dailyLimitMs = 2 * MS.HOUR;
  return {
    listMode: 'blocklist',
    resetHour: 4,
    allowlistAuthDomains: [...DEFAULT_AUTH_DOMAINS],
    extraTimeOnRestartMs: 30 * MS.MINUTE,
    emergencyPauseMs: 10 * MS.MINUTE,
    emergencyPauseUsedDate: null,
    emergencyPauseCategoryId: null,
    settingsLocked: false,
    firstEditDone: false,
    companionConnected: false,
    incognitoAllowed: true,
    guardActive: false,
    developerMode: false,
    devTenSecondTest: false,
    devTenSecondTestSnapshot: null,
    devLiveToastTest: false,
    devLiveToastTestSnapshot: null,
    lastGlobalResetDate: null,
    bedtime: {
      enabled: false,
      start: '23:00',
      end: '07:00',
      hardcore: false,
    },
    productivitySites: [],
    customQuotes: [],
    customImages: [],
    categories: [
      {
        id: 'default',
        name: 'Default',
        sites: ['youtube.com', 'instagram.com', 'twitter.com', 'x.com', 'reddit.com'],
        dailyLimitMs,
        remainingMs: dailyLimitMs,
        lastResetDate: null,
      },
    ],
  };
}

/**
 * @param {Settings} settings
 * @returns {Settings}
 */
export function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

/**
 * @returns {string}
 */
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
