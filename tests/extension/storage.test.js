import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings,
  saveSettings,
  resetStorageCache,
  applyCategoryLimitChange,
  mergeSettingsFromCompanion,
} from '../../extension/lib/storage.js';
import { createDefaultSettings, MS } from '../../extension/lib/constants.js';
import { chrome, resetChromeMocks } from './mocks/chrome.js';

beforeEach(() => {
  resetChromeMocks();
  resetStorageCache();
});

describe('storage', () => {
  it('returns defaults when empty', async () => {
    const settings = await loadSettings(chrome.storage.local);
    expect(settings.listMode).toBe('blocklist');
    expect(settings.categories.length).toBe(1);
  });

  it('persists settings', async () => {
    const settings = createDefaultSettings();
    settings.resetHour = 6;
    await saveSettings(settings, chrome.storage.local);
    resetStorageCache();
    const loaded = await loadSettings(chrome.storage.local);
    expect(loaded.resetHour).toBe(6);
  });
});

describe('applyCategoryLimitChange', () => {
  it('restores full pool when limit increases from exhausted state', () => {
    const cat = {
      id: 'default',
      name: 'Default',
      sites: ['youtube.com'],
      dailyLimitMs: MS.MINUTE,
      remainingMs: 0,
      lastResetDate: null,
    };
    applyCategoryLimitChange(cat, 120 * MS.MINUTE);
    expect(cat.dailyLimitMs).toBe(120 * MS.MINUTE);
    expect(cat.remainingMs).toBe(120 * MS.MINUTE);
  });

  it('adds delta when limit increases with time remaining', () => {
    const cat = {
      id: 'default',
      name: 'Default',
      sites: [],
      dailyLimitMs: 60 * MS.MINUTE,
      remainingMs: 30 * MS.MINUTE,
      lastResetDate: null,
    };
    applyCategoryLimitChange(cat, 120 * MS.MINUTE);
    expect(cat.remainingMs).toBe(90 * MS.MINUTE);
  });

  it('caps remaining when limit decreases', () => {
    const cat = {
      id: 'default',
      name: 'Default',
      sites: [],
      dailyLimitMs: 120 * MS.MINUTE,
      remainingMs: 90 * MS.MINUTE,
      lastResetDate: null,
    };
    applyCategoryLimitChange(cat, 60 * MS.MINUTE);
    expect(cat.remainingMs).toBe(60 * MS.MINUTE);
  });
});

describe('mergeSettingsFromCompanion', () => {
  it('keeps local limits when companion has stale config', () => {
    const local = createDefaultSettings();
    local.categories[0].dailyLimitMs = 120 * MS.MINUTE;
    local.categories[0].remainingMs = 120 * MS.MINUTE;

    const remote = createDefaultSettings();
    remote.categories[0].dailyLimitMs = MS.MINUTE;
    remote.categories[0].remainingMs = 0;

    const merged = mergeSettingsFromCompanion(local, remote);
    expect(merged.categories[0].dailyLimitMs).toBe(120 * MS.MINUTE);
    expect(merged.categories[0].remainingMs).toBe(120 * MS.MINUTE);
  });

  it('prefers local remaining when companion is stale at same limit', () => {
    const local = createDefaultSettings();
    local.categories[0].dailyLimitMs = 120 * MS.MINUTE;
    local.categories[0].remainingMs = 120 * MS.MINUTE;

    const remote = createDefaultSettings();
    remote.categories[0].dailyLimitMs = 120 * MS.MINUTE;
    remote.categories[0].remainingMs = 0;

    const merged = mergeSettingsFromCompanion(local, remote);
    expect(merged.categories[0].remainingMs).toBe(120 * MS.MINUTE);
  });

  it('uses companion remaining when limits match and local is also exhausted', () => {
    const local = createDefaultSettings();
    local.categories[0].remainingMs = 0;

    const remote = createDefaultSettings();
    remote.categories[0].remainingMs = 0;

    const merged = mergeSettingsFromCompanion(local, remote);
    expect(merged.categories[0].remainingMs).toBe(0);
  });

  it('prefers local remaining when extension set a lower dev test value', () => {
    const local = createDefaultSettings();
    local.categories[0].remainingMs = 70 * MS.SECOND;

    const remote = createDefaultSettings();
    remote.categories[0].remainingMs = 2 * MS.HOUR;

    const merged = mergeSettingsFromCompanion(local, remote);
    expect(merged.categories[0].remainingMs).toBe(70 * MS.SECOND);
  });

  it('prefers companion remaining when companion tracked more consumption', () => {
    const local = createDefaultSettings();
    local.categories[0].remainingMs = 90 * MS.MINUTE;

    const remote = createDefaultSettings();
    remote.categories[0].remainingMs = 80 * MS.MINUTE;

    const merged = mergeSettingsFromCompanion(local, remote);
    expect(merged.categories[0].remainingMs).toBe(80 * MS.MINUTE);
  });

  it('keeps local remaining while live toast dev test is active', () => {
    const local = createDefaultSettings();
    local.devLiveToastTest = true;
    local.devLiveToastTestSnapshot = { default: 2 * MS.HOUR };
    local.categories[0].remainingMs = 70 * MS.SECOND;

    const remote = createDefaultSettings();
    remote.categories[0].remainingMs = 2 * MS.HOUR;

    const merged = mergeSettingsFromCompanion(local, remote);
    expect(merged.categories[0].remainingMs).toBe(70 * MS.SECOND);
    expect(merged.devLiveToastTest).toBe(true);
  });
});
