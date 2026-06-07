import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetSessionState,
  getSessionState,
  stopConsumption,
  startConsumption,
  getEffectiveRemainingMs,
  restoreSessionFromStorage,
  handleTimeUp,
  sessionState,
} from '../../extension/lib/time-engine.js';
import { resetStorageCache, loadSettings } from '../../extension/lib/storage.js';
import { createDefaultSettings, MS, ALARM_NAMES } from '../../extension/lib/constants.js';
import { chrome, resetChromeMocks } from './mocks/chrome.js';

beforeEach(() => {
  resetChromeMocks();
  resetStorageCache();
  resetSessionState();
});

describe('time-engine', () => {
  it('starts and stops consumption', async () => {
    const settings = createDefaultSettings();
    await chrome.storage.local.set({ webwarden_settings: settings });

    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com' },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );
    expect(getSessionState().isConsumingTime).toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    await stopConsumption(chrome.alarms, chrome.storage.session);
    expect(getSessionState().isConsumingTime).toBe(false);

    const updated = await loadSettings(chrome.storage.local);
    expect(updated.categories[0].remainingMs).toBeLessThan(settings.categories[0].remainingMs);
  });

  it('reschedules alarms when remaining changes for the same category', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 10 * MS.SECOND;
    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com', tabId: 1 },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    settings.categories[0].remainingMs = 10 * MS.SECOND;
    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com', tabId: 1 },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    const alarm = chrome.alarms._alarms.get('timeUp');
    expect(alarm?.when).toBeGreaterThan(Date.now());
    expect(alarm?.when).toBeLessThanOrEqual(Date.now() + 10 * MS.SECOND + 50);
  });

  it('restarts session clock when remaining is increased externally', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 30 * MS.SECOND;
    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com', tabId: 42 },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    await new Promise((r) => setTimeout(r, 20));
    settings.categories[0].remainingMs = 70 * MS.SECOND;
    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com', tabId: 42 },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    const toast1 = chrome.alarms._alarms.get(ALARM_NAMES.TOAST_1);
    expect(toast1?.when).toBeGreaterThan(Date.now() + 8 * MS.SECOND);
    expect(getSessionState().activeTabId).toBe(42);
    expect(getSessionState().sessionBaseRemainingMs).toBe(70 * MS.SECOND);
  });

  it('does not reset session clock when the same category is re-evaluated', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 70 * MS.SECOND;
    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com', tabId: 1 },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    sessionState.sessionStartMs = Date.now() - 15 * MS.SECOND;
    const before = getEffectiveRemainingMs(settings.categories[0]);

    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com', tabId: 1 },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    const after = getEffectiveRemainingMs(settings.categories[0]);
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeLessThan(70 * MS.SECOND);
  });

  it('restores persisted session after memory reset', async () => {
    const settings = createDefaultSettings();
    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com' },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    resetSessionState();
    await restoreSessionFromStorage(chrome.storage.session);
    expect(getSessionState().isConsumingTime).toBe(true);
    expect(getSessionState().activeCategoryId).toBe('default');
  });

  it('handleTimeUp works after session memory is cleared', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 10 * MS.SECOND;
    await chrome.storage.local.set({ webwarden_settings: settings });

    await startConsumption(
      { categoryId: 'default', domain: 'youtube.com' },
      settings,
      chrome.alarms,
      chrome.storage.session,
    );

    sessionState.sessionStartMs = Date.now() - 10 * MS.SECOND;
    await chrome.storage.session.set({ webwarden_active_session: { ...sessionState } });
    resetSessionState();

    const tabsApi = {
      query: async () => [{ id: 1, url: 'https://www.youtube.com/watch?v=abc' }],
      update: async () => {},
    };

    await handleTimeUp(tabsApi, chrome.alarms, chrome.storage.session);

    const updated = await loadSettings(chrome.storage.local);
    expect(updated.categories[0].remainingMs).toBe(0);
  });
});

describe('getEffectiveRemainingMs', () => {
  it('subtracts elapsed active session time', () => {
    const cat = createDefaultSettings().categories[0];
    cat.remainingMs = 10 * MS.SECOND;
    const session = {
      isConsumingTime: true,
      activeCategoryId: 'default',
      sessionStartMs: Date.now() - 4 * MS.SECOND,
      activeDomain: 'youtube.com',
    };
    expect(getEffectiveRemainingMs(cat, session)).toBeLessThanOrEqual(6 * MS.SECOND + 50);
  });
});
