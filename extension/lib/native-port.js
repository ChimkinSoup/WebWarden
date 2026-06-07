import { NATIVE_HOST, ALARM_NAMES } from './constants.js';
import { loadSettings, saveSettings, mergeSettingsFromCompanion } from './storage.js';
import { updateGuardState, checkIncognitoAccess } from './incognito-guard.js';
import { refreshDnrRules } from './dnr.js';

/** @type {chrome.runtime.Port|null} */
let port = null;

/** @type {((msg: object) => void)[]} */
const messageListeners = [];

/** @type {boolean} */
let reconnectScheduled = false;

/** @type {Promise<void>|null} */
let markConnectedQueue = null;

/**
 * @param {(msg: object) => void} listener
 */
export function onCompanionMessage(listener) {
  messageListeners.push(listener);
}

/**
 * @returns {boolean}
 */
export function isPortConnected() {
  return port !== null;
}

/**
 * Send message to companion. Returns a promise if response expected.
 * @param {object} message
 * @returns {Promise<object>|void}
 */
export function sendMessage(message) {
  if (!port) {
    return Promise.reject(new Error('Companion not connected'));
  }
  const requestId = message.requestId || `${Date.now()}-${Math.random()}`;
  const payload = { ...message, requestId };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Companion timeout')), 10000);

    const listener = (response) => {
      if (response.requestId === requestId) {
        clearTimeout(timeout);
        port?.onMessage.removeListener(listener);
        resolve(response);
      }
    };

    port.onMessage.addListener(listener);
    try {
      port.postMessage(payload);
    } catch (e) {
      clearTimeout(timeout);
      port?.onMessage.removeListener(listener);
      reject(e);
    }
  });
}

/**
 * @param {typeof chrome.runtime|null} runtimeApi
 */
export function connectNative(runtimeApi) {
  const runtime = runtimeApi || (typeof chrome !== 'undefined' ? chrome.runtime : null);
  if (!runtime?.connectNative) return null;

  try {
    if (port) {
      try { port.disconnect(); } catch { /* ignore */ }
    }
    port = runtime.connectNative(NATIVE_HOST);

    port.onMessage.addListener((msg) => {
      for (const listener of messageListeners) listener(msg);
      if (msg.type === 'STATE_PUSH' && msg.settings) {
        loadSettings().then(async (local) => {
          const merged = mergeSettingsFromCompanion(local, msg.settings);
          await saveSettings(merged);
          await refreshDnrRules(merged, null, runtime.id).catch(() => {});
        });
      }
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      port = null;
      if (err) {
        console.warn('WebWarden companion disconnected:', err);
      }
      handleDisconnect();
      scheduleReconnect(runtime);
    });

    return port;
  } catch (e) {
    port = null;
    markCompanionConnected(false).catch(() => {});
    return null;
  }
}

/**
 * @param {boolean} connected
 */
async function markCompanionConnected(connected) {
  if (markConnectedQueue) {
    await markConnectedQueue;
  }

  markConnectedQueue = (async () => {
    const settings = await loadSettings();
    const withIncognito = await checkIncognitoAccess(settings);
    updateGuardState(withIncognito, connected, withIncognito.incognitoAllowed);
    await saveSettings(withIncognito);
    if (typeof chrome !== 'undefined') {
      await refreshDnrRules(withIncognito, null, chrome.runtime.id);
    }
  })();

  try {
    await markConnectedQueue;
  } catch (e) {
    console.error('WebWarden: failed to update companion state', e);
  } finally {
    markConnectedQueue = null;
  }
}

function handleDisconnect() {
  markCompanionConnected(false).catch(() => {});
}

/**
 * @param {typeof chrome.runtime} runtime
 */
function scheduleReconnect(runtime) {
  if (reconnectScheduled) return;
  reconnectScheduled = true;
  setTimeout(() => {
    reconnectScheduled = false;
    connectNative(runtime);
  }, 1000);
}

/**
 * Initialize native port and reconnect alarm.
 * @param {typeof chrome.alarms|null} [alarmsApi]
 * @param {typeof chrome.runtime|null} [runtimeApi]
 */
export async function initNativePort(alarmsApi, runtimeApi) {
  const alarms = alarmsApi || (typeof chrome !== 'undefined' ? chrome.alarms : null);
  connectNative(runtimeApi);

  if (alarms) {
    await alarms.create(ALARM_NAMES.RECONNECT, { periodInMinutes: 1 });
  }
}

/**
 * Fetch full state from companion.
 */
export async function fetchCompanionState() {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!port) connectNative();
    if (!port) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    try {
      const response = await sendMessage({ type: 'GET_STATE' });
      if (response.settings) {
        const settings = await loadSettings();
        const merged = mergeSettingsFromCompanion(settings, response.settings);
        await saveSettings(merged);
        try {
          await sendMessage({ type: 'SETTINGS_UPDATE', settings: merged, frictionToken: null });
        } catch { /* companion may reject; local merge still applied */ }
        await markCompanionConnected(true);
        return merged;
      }
    } catch (e) {
      console.warn(`WebWarden: companion unreachable (attempt ${attempt + 1})`, e?.message || e);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await markCompanionConnected(false);
  return loadSettings();
}

/**
 * Re-check incognito + companion and refresh blocking rules.
 */
export async function recheckGuardState() {
  let connected = isPortConnected();
  if (connected) {
    try {
      await sendMessage({ type: 'PING' });
    } catch {
      connected = false;
    }
  } else {
    connectNative();
    try {
      await sendMessage({ type: 'PING' });
      connected = true;
    } catch {
      connected = false;
    }
  }
  await markCompanionConnected(connected);
  return connected;
}

/**
 * @param {typeof chrome.alarms|null} alarmsApi
 */
export async function handleReconnectAlarm(alarmsApi) {
  await recheckGuardState();
}
