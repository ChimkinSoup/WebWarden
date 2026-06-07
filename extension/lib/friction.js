const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/~`';

export const DEV_BYPASS_PHRASE = 'dev';

/**
 * Generate a 100-character random string (no spaces).
 * @returns {string}
 */
export function generateChallenge() {
  let result = '';
  for (let i = 0; i < 100; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

/**
 * Validate a single keystroke at position.
 * @param {string} challenge
 * @param {number} index
 * @param {string} char
 * @returns {boolean}
 */
export function validateChar(challenge, index, char) {
  return challenge[index] === char;
}

/**
 * @param {string} challenge
 * @param {string} typed
 * @returns {boolean}
 */
export function isChallengeComplete(challenge, typed) {
  return typed.length === 100 && typed === challenge;
}

/**
 * @param {string} typed
 * @returns {boolean}
 */
export function isDevBypassComplete(typed) {
  return typed === DEV_BYPASS_PHRASE;
}

/**
 * @param {string} typed
 * @param {string} char
 * @returns {boolean}
 */
export function acceptsDevBypassChar(typed, char) {
  return DEV_BYPASS_PHRASE.startsWith(typed + char);
}

/**
 * @param {string} typed
 * @returns {boolean}
 */
export function isFrictionChallengePassed(typed) {
  return typed.length === 100 || isDevBypassComplete(typed);
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {boolean}
 */
export function isDeveloperMode(settings) {
  return Boolean(settings.developerMode);
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {boolean}
 */
export function canEditSettingsFreely(settings) {
  return isDeveloperMode(settings) || !settings.firstEditDone || !settings.settingsLocked;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {{ frictionPassed?: boolean, restartVerified?: boolean, siteListOnly?: boolean }} gate
 * @returns {boolean}
 */
export function canEditProtectedSettings(settings, gate = {}) {
  if (isDeveloperMode(settings)) return true;
  if (!settings.firstEditDone) return true;
  if (gate.siteListOnly) return true;
  return Boolean(gate.frictionPassed && gate.restartVerified);
}

/**
 * Mark first edit as done (locks settings).
 * @param {import('./constants.js').Settings} settings
 */
export function markFirstEditDone(settings) {
  settings.firstEditDone = true;
  settings.settingsLocked = true;
  return settings;
}
