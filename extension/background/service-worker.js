import { ALARM_NAMES } from '../lib/constants.js';
import { loadSettings, saveSettings, updateSettings, enforceCategoriesSiteAddOnly } from '../lib/storage.js';
import { applyDailyReset, shouldRunDailyReset } from '../lib/reset.js';
import { refreshDnrRules } from '../lib/dnr.js';
import { initNativePort, fetchCompanionState, handleReconnectAlarm, sendMessage, recheckGuardState } from '../lib/native-port.js';
import { checkIncognitoAccess, updateGuardState, getGuardBlockReason } from '../lib/incognito-guard.js';
import {
  evaluateActiveConsumption,
  handleIdleStateChange,
  handleTimeUp,
  getSessionState,
  stopConsumption,
  restoreSessionFromStorage,
  getEffectiveRemainingMs,
  checkAndHandleExpiredSession,
} from '../lib/time-engine.js';
import { setDevTenSecondTest, clearDevTenSecondTestIfActive, clearDevLiveToastTestIfActive, enableDevLiveToastTest, finalizeDeveloperModeSave, resetEmergencyPauseForDev, DEV_TEN_SECOND_TEST_MS } from '../lib/dev-time-test.js';
import { toastMinutesForAlarm, showRemainingToast } from '../lib/alarms.js';
import { addCategoryTime } from '../lib/storage.js';
import { localDateKey, MS } from '../lib/constants.js';
import { getBlockStatus, collectBlockedPatterns } from '../lib/block-logic.js';
import { isBedtimeActive } from '../lib/bedtime.js';
import { refreshActionIcon, setDevIconOverride, setDevOrangeIconOverride } from '../lib/action-icon.js';
import { redirectTabIfBlocked, redirectTabsWithExhaustedTime, restoreBlockedTabsAfterEmergencyPause, forgetBlockedTabReturn } from '../lib/tab-redirect.js';
import { normalizeRestartCheckResponse } from '../lib/restart-response.js';

async function bootstrap() {
  await initNativePort();
  await fetchCompanionState();

  let settings = await loadSettings();
  if (shouldRunDailyReset(settings)) {
    settings = applyDailyReset(settings);
    await saveSettings(settings);
  }

  await recheckGuardState();

  chrome.alarms.create(ALARM_NAMES.RESET_CHECK, { periodInMinutes: 60 });

  chrome.idle.setDetectionInterval(15);

  await refreshActionIcon(settings);
}

async function onTabsChanged(activeTabId) {
  await evaluateActiveConsumption();
  await refreshActionIcon();

  const settings = await loadSettings();
  if (activeTabId !== undefined) {
    await redirectTabIfBlocked(activeTabId, settings);
  }
}

chrome.runtime.onInstalled.addListener(() => bootstrap());
chrome.runtime.onStartup.addListener(() => bootstrap());

chrome.tabs.onActivated.addListener(({ tabId }) => onTabsChanged(tabId));
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (chrome.windows.WINDOW_ID_NONE !== undefined && windowId !== chrome.windows.WINDOW_ID_NONE) {
    const [active] = await chrome.tabs.query({ active: true, windowId });
    await onTabsChanged(active?.id);
  }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    onTabsChanged(tabId);
  } else if (changeInfo.audible !== undefined) {
    evaluateActiveConsumption();
  }
});
chrome.tabs.onCreated.addListener(() => onTabsChanged());
chrome.tabs.onRemoved.addListener((tabId) => {
  forgetBlockedTabReturn(tabId).catch(() => {});
  onTabsChanged();
});
chrome.idle.onStateChanged.addListener((state) => handleIdleStateChange(state));

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAMES.RECONNECT) {
    await handleReconnectAlarm();
    return;
  }
  if (alarm.name === ALARM_NAMES.RESET_CHECK) {
    const settings = await loadSettings();
    if (shouldRunDailyReset(settings)) {
      await saveSettings(applyDailyReset(settings));
      await refreshDnrRules(await loadSettings(), null, chrome.runtime.id);
    }
    return;
  }
  if (alarm.name === ALARM_NAMES.TIME_UP) {
    await handleTimeUp();
    const settings = await loadSettings();
    await refreshDnrRules(settings, null, chrome.runtime.id);
    await refreshActionIcon(settings);
    return;
  }
  const minutes = toastMinutesForAlarm(alarm.name);
  if (minutes !== null) {
    await restoreSessionFromStorage();
    const settings = await loadSettings();
    const state = getSessionState();
    const category = settings.categories.find((c) => c.id === state.activeCategoryId);
    await showRemainingToast(minutes, {
      categoryName: category?.name ?? null,
    });
    await refreshActionIcon(settings, null, null, { force: true, session: state });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SHOW_TIME_TOAST') {
    return false;
  }
  handleRuntimeMessage(message).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

async function handleRuntimeMessage(message) {
  switch (message.type) {
    case 'GET_POPUP_STATE': {
      let settings = await loadSettings();
      await restoreSessionFromStorage();
      if (await checkAndHandleExpiredSession(settings)) {
        settings = await loadSettings();
        await refreshDnrRules(settings, null, chrome.runtime.id);
        await refreshActionIcon(settings);
        await redirectTabsWithExhaustedTime(settings);
      }
      const session = getSessionState();

      const categories = settings.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        dailyLimitMs: cat.dailyLimitMs,
        remainingMs: cat.remainingMs,
        displayRemainingMs: getEffectiveRemainingMs(cat, session),
      }));

      return {
        ok: true,
        guardActive: settings.guardActive,
        guardReason: getGuardBlockReason(settings),
        companionConnected: settings.companionConnected,
        tracking: session.isConsumingTime,
        trackingCategoryId: session.activeCategoryId,
        categories,
      };
    }

    case 'GET_SETTINGS':
      return { ok: true, settings: await loadSettings() };

    case 'REFRESH_GUARD': {
      const connected = await recheckGuardState();
      const settings = await loadSettings();
      return {
        ok: true,
        companionConnected: connected,
        guardActive: settings.guardActive,
        guardReason: getGuardBlockReason(settings),
        settings,
      };
    }

    case 'GET_STATUS': {
      const settings = await loadSettings();
      return {
        ok: true,
        companionConnected: settings.companionConnected,
        incognitoAllowed: settings.incognitoAllowed,
        guardActive: settings.guardActive,
        guardReason: getGuardBlockReason(settings),
      };
    }

    case 'SAVE_SETTINGS': {
      const current = await loadSettings();
      const devMode = message.settings?.developerMode ?? current.developerMode;
      const frictionPassed = Boolean(message.frictionPassed);
      const siteAddOnly = !devMode && current.settingsLocked && current.firstEditDone && !frictionPassed;

      if (!devMode && current.settingsLocked && message.fullEdit && !frictionPassed) {
        return { ok: false, error: 'Settings locked' };
      }

      let next = { ...current, ...message.settings };
      if (siteAddOnly) {
        next = {
          ...current,
          categories: enforceCategoriesSiteAddOnly(current.categories, message.settings.categories),
        };
      }

      if (!devMode && !current.firstEditDone && message.markFirstEdit) {
        next.firstEditDone = true;
        next.settingsLocked = true;
      }

      await stopConsumption();
      if (next.developerMode) {
        finalizeDeveloperModeSave(next);
      }

      await saveSettings(next);
      try {
        await sendMessage({ type: 'SETTINGS_UPDATE', settings: next, frictionToken: message.frictionToken || null });
      } catch { /* local cache still updated */ }
      await refreshDnrRules(next, null, chrome.runtime.id);
      await refreshActionIcon(next);
      await evaluateActiveConsumption();
      return { ok: true, settings: next };
    }

    case 'SET_DEVELOPER_MODE': {
      const settings = await loadSettings();
      settings.developerMode = Boolean(message.enabled);
      if (!settings.developerMode) {
        setDevIconOverride(false);
        setDevOrangeIconOverride(false);
        await stopConsumption();
        clearDevTenSecondTestIfActive(settings);
        clearDevLiveToastTestIfActive(settings);
      }
      await saveSettings(settings);
      try {
        await sendMessage({ type: 'SETTINGS_UPDATE', settings, frictionToken: null });
      } catch { /* ignore */ }
      await refreshDnrRules(settings, null, chrome.runtime.id);
      await evaluateActiveConsumption();
      await refreshActionIcon(settings);
      return { ok: true, settings, developerMode: settings.developerMode };
    }

    case 'CHECK_RESTART': {
      try {
        const resp = await sendMessage({ type: 'CHECK_RESTART' });
        return normalizeRestartCheckResponse(resp);
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'DEV_SIMULATE_RESTART': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      try {
        const resp = await sendMessage({ type: 'DEV_SIMULATE_RESTART' });
        return normalizeRestartCheckResponse(resp);
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'DEV_SHOW_TOAST': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      const minutes = message.minutes;
      if (minutes !== 5 && minutes !== 1) {
        return { ok: false, error: 'Supported toast tests: 5 or 1 minute' };
      }
      await showRemainingToast(minutes, {
        categoryName: settings.categories[0]?.name ?? null,
      });
      return { ok: true };
    }

    case 'DEV_START_LIVE_TOAST': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      if (!settings.categories[0]) {
        return { ok: false, error: 'No category configured' };
      }
      await stopConsumption();
      enableDevLiveToastTest(settings);
      await saveSettings(settings);
      try {
        await sendMessage({ type: 'SETTINGS_UPDATE', settings, frictionToken: null });
      } catch { /* local test state still armed */ }
      await evaluateActiveConsumption();
      const state = getSessionState();
      return {
        ok: true,
        consuming: state.isConsumingTime,
        message: state.isConsumingTime
          ? 'Live test armed. Stay on this tracked site ~10 seconds for a 1-minute warning toast.'
          : 'Remaining time set to 70s. Open a tracked site now (e.g. youtube.com) — toast fires ~10s after you arrive.',
      };
    }

    case 'DEV_SET_ICON_OVERRIDE': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      setDevIconOverride(Boolean(message.forced));
      await refreshActionIcon(settings, null, null, { force: true });
      return { ok: true, forced: Boolean(message.forced) };
    }

    case 'DEV_SET_ORANGE_ICON_OVERRIDE': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      setDevOrangeIconOverride(Boolean(message.forced));
      await refreshActionIcon(settings, null, null, { force: true });
      return { ok: true, forced: Boolean(message.forced) };
    }

    case 'DEV_RESET_EMERGENCY_PAUSE': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      resetEmergencyPauseForDev(settings);
      await saveSettings(settings);
      try {
        await sendMessage({ type: 'SETTINGS_UPDATE', settings, frictionToken: null });
      } catch { /* local reset still applied */ }
      await refreshDnrRules(settings, null, chrome.runtime.id);
      return { ok: true };
    }

    case 'DEV_TOGGLE_TEN_SECOND_TEST': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }

      await stopConsumption();
      const enabled = Boolean(message.enabled);
      setDevTenSecondTest(settings, enabled);
      await saveSettings(settings);
      try {
        await sendMessage({ type: 'SETTINGS_UPDATE', settings, frictionToken: null });
      } catch { /* local state updated */ }
      await refreshDnrRules(settings, null, chrome.runtime.id);
      await evaluateActiveConsumption();
      await refreshActionIcon(settings);

      return {
        ok: true,
        enabled: settings.devTenSecondTest,
        settings,
        message: enabled
          ? `10s block test enabled — all categories set to ${DEV_TEN_SECOND_TEST_MS / MS.SECOND}s. Visit a tracked site to test the redirect.`
          : '10s block test disabled — remaining time restored.',
      };
    }

    case 'ADD_SITES': {
      const settings = await loadSettings();
      const cat = settings.categories.find((c) => c.id === message.categoryId);
      if (cat && message.sites) {
        cat.sites = [...new Set([...cat.sites, ...message.sites])];
        await saveSettings(settings);
        try { await sendMessage({ type: 'SETTINGS_UPDATE', settings, frictionToken: null }); } catch { /* ignore */ }
        await refreshDnrRules(settings, null, chrome.runtime.id);
      }
      return { ok: true, settings };
    }

    case 'VERIFY_RESTART': {
      try {
        const resp = await sendMessage({ type: 'VERIFY_RESTART' });
        const normalized = normalizeRestartCheckResponse(resp);
        if (!normalized.ok) {
          return normalized;
        }
        if (normalized.granted && message.categoryId) {
          const settings = await loadSettings();
          await addCategoryTime(message.categoryId, settings.extraTimeOnRestartMs);
          await refreshDnrRules(await loadSettings(), null, chrome.runtime.id);
        }
        return normalized;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'EMERGENCY_PAUSE': {
      const settings = await loadSettings();
      const today = localDateKey();
      if (settings.emergencyPauseUsedDate === today) {
        return { ok: false, error: 'Already used today' };
      }
      const resp = await sendMessage({ type: 'GRANT_EMERGENCY_PAUSE', categoryId: message.categoryId });
      if (resp.ok) {
        await updateSettings((s) => {
          s.emergencyPauseUsedDate = today;
          s.emergencyPauseCategoryId = message.categoryId;
          const cat = s.categories.find((c) => c.id === message.categoryId);
          if (cat) cat.remainingMs = s.emergencyPauseMs;
          return s;
        });
        await refreshDnrRules(await loadSettings(), null, chrome.runtime.id);
        await restoreBlockedTabsAfterEmergencyPause(message.categoryId);
      }
      return resp;
    }

    case 'BEDTIME_CHALLENGE': {
      const resp = await sendMessage({ type: 'GRANT_BEDTIME_CHALLENGE', categoryId: message.categoryId });
      if (resp.ok && message.categoryId) {
        const settings = await loadSettings();
        await addCategoryTime(message.categoryId, settings.extraTimeOnRestartMs);
        await refreshDnrRules(await loadSettings(), null, chrome.runtime.id);
      }
      return resp;
    }

    case 'GET_BLOCK_DEBUG': {
      const settings = await loadSettings();
      const domain = message.domain || '';
      const categoryId = message.categoryId || '';
      const reason = message.reason || '';
      const testUrl = domain ? `https://${domain}/` : '';
      const blockStatus = testUrl ? getBlockStatus(testUrl, settings) : null;
      const cat = categoryId
        ? settings.categories.find((c) => c.id === categoryId)
        : blockStatus?.categoryId
          ? settings.categories.find((c) => c.id === blockStatus.categoryId)
          : null;
      const patterns = collectBlockedPatterns(settings);
      const matchingPatterns = domain
        ? patterns.filter((p) => p.pattern === domain || domain.endsWith(p.pattern.replace(/^\*\./, '')))
        : [];
      return {
        ok: true,
        query: { domain, categoryId, reason },
        guardActive: settings.guardActive,
        guardReason: getGuardBlockReason(settings),
        companionConnected: settings.companionConnected,
        incognitoAllowed: settings.incognitoAllowed,
        developerMode: settings.developerMode,
        listMode: settings.listMode,
        bedtimeActive: isBedtimeActive(settings),
        bedtime: settings.bedtime,
        blockStatus,
        category: cat
          ? {
              id: cat.id,
              name: cat.name,
              dailyLimitMs: cat.dailyLimitMs,
              remainingMs: cat.remainingMs,
              sites: cat.sites,
            }
          : null,
        categories: settings.categories.map((c) => ({
          id: c.id,
          name: c.name,
          dailyLimitMs: c.dailyLimitMs,
          remainingMs: c.remainingMs,
        })),
        dnrBlockPatternCount: patterns.length,
        matchingPatterns,
        session: getSessionState(),
      };
    }

    case 'REFRESH_BLOCKING': {
      await recheckGuardState();
      const settings = await loadSettings();
      await refreshDnrRules(settings, null, chrome.runtime.id);
      return { ok: true, settings };
    }

    case 'DEV_RESTORE_CATEGORY_TIME': {
      const settings = await loadSettings();
      if (!settings.developerMode) {
        return { ok: false, error: 'Developer mode required' };
      }
      const cat = settings.categories.find((c) => c.id === message.categoryId)
        || settings.categories[0];
      if (!cat) {
        return { ok: false, error: 'No category configured' };
      }
      cat.remainingMs = cat.dailyLimitMs;
      await saveSettings(settings);
      try {
        await sendMessage({ type: 'SETTINGS_UPDATE', settings, frictionToken: null });
      } catch { /* local state updated */ }
      await refreshDnrRules(settings, null, chrome.runtime.id);
      return { ok: true, categoryId: cat.id, remainingMs: cat.remainingMs };
    }

    case 'GET_ANALYTICS': {
      try {
        return await sendMessage({ type: 'GET_ANALYTICS' });
      } catch {
        return { analytics: {} };
      }
    }

    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

bootstrap();
