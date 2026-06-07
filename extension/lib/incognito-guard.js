/**
 * Check incognito access and update settings guard flag.
 * @param {import('./constants.js').Settings} settings
 * @param {typeof chrome.extension|null} extensionApi
 */
export async function checkIncognitoAccess(settings, extensionApi) {
  const api = extensionApi || (typeof chrome !== 'undefined' ? chrome.extension : null);
  if (!api?.isAllowedIncognitoAccess) {
    settings.incognitoAllowed = true;
    return settings;
  }
  settings.incognitoAllowed = await new Promise((resolve) => {
    api.isAllowedIncognitoAccess(resolve);
  });
  return settings;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @returns {string|null}
 */
export function getGuardBlockReason(settings) {
  if (!settings.guardActive) return null;
  if (!settings.incognitoAllowed && !settings.companionConnected) {
    return 'Enable "Allow in incognito" and ensure the companion app is connected.';
  }
  if (!settings.incognitoAllowed) {
    return 'Enable "Allow in incognito" on chrome://extensions for WebWarden.';
  }
  if (!settings.companionConnected) {
    return 'The Windows companion app is not connected. Run npm run install:native-host and reload the extension.';
  }
  return null;
}

/**
 * @param {import('./constants.js').Settings} settings
 */
export function shouldActivateGuard(settings) {
  return !settings.incognitoAllowed || !settings.companionConnected;
}

/**
 * @param {import('./constants.js').Settings} settings
 * @param {boolean} companionConnected
 * @param {boolean} incognitoAllowed
 */
export function updateGuardState(settings, companionConnected, incognitoAllowed) {
  settings.companionConnected = companionConnected;
  settings.incognitoAllowed = incognitoAllowed;
  settings.guardActive = !companionConnected || !incognitoAllowed;
  return settings;
}
