import { describe, it, expect, beforeEach } from 'vitest';
import {
  wouldTrackTime,
  resetActionIconState,
  setDevIconOverride,
  setDevOrangeIconOverride,
  resolveActionIconState,
  getMinimumDisplayRemainingMs,
  LOW_TIME_ICON_THRESHOLD_MS,
} from '../../extension/lib/action-icon.js';
import { createDefaultSettings, MS } from '../../extension/lib/constants.js';

beforeEach(() => {
  resetActionIconState();
});

describe('action-icon', () => {
  const emptySession = {
    isConsumingTime: false,
    activeCategoryId: null,
    sessionStartMs: null,
    activeDomain: null,
    activeTabId: null,
    sessionBaseRemainingMs: null,
  };

  it('returns true for an active tracked tab', () => {
    const settings = createDefaultSettings();
    const tabs = [{ url: 'https://www.youtube.com/watch?v=abc', active: true }];
    expect(wouldTrackTime(tabs, settings)).toBe(true);
  });

  it('returns true for an audible background tracked tab', () => {
    const settings = createDefaultSettings();
    const tabs = [{ url: 'https://www.youtube.com/watch?v=abc', audible: true, active: false }];
    expect(wouldTrackTime(tabs, settings)).toBe(true);
  });

  it('returns false for a background tracked tab with no audio', () => {
    const settings = createDefaultSettings();
    const tabs = [{ url: 'https://www.youtube.com/watch?v=abc', active: false, audible: false }];
    expect(wouldTrackTime(tabs, settings)).toBe(false);
  });

  it('returns false when no tracked tabs are consuming', () => {
    const settings = createDefaultSettings();
    const tabs = [{ url: 'https://www.google.com/', active: true }];
    expect(wouldTrackTime(tabs, settings)).toBe(false);
  });

  it('ignores extension and chrome URLs', () => {
    const settings = createDefaultSettings();
    const tabs = [
      { url: 'chrome://extensions/', active: true },
      { url: 'chrome-extension://abc/blocked/blocked.html', active: true },
    ];
    expect(wouldTrackTime(tabs, settings)).toBe(false);
  });

  it('resolves blue when idle with plenty of time remaining', () => {
    const settings = createDefaultSettings();
    expect(resolveActionIconState(settings, emptySession, [])).toBe('blue');
  });

  it('resolves red when actively tracking time', () => {
    const settings = createDefaultSettings();
    const tabs = [{ url: 'https://www.youtube.com/watch?v=abc', active: true }];
    expect(resolveActionIconState(settings, emptySession, tabs)).toBe('red');
  });

  it('resolves orange when five minutes or less remain', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 5 * MS.MINUTE;
    expect(resolveActionIconState(settings, emptySession, [])).toBe('orange');
  });

  it('prefers orange over red when under five minutes while tracking', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 3 * MS.MINUTE;
    const tabs = [{ url: 'https://www.youtube.com/watch?v=abc', active: true }];
    expect(resolveActionIconState(settings, emptySession, tabs)).toBe('orange');
  });

  it('uses dev orange override through the same orange state', () => {
    const settings = createDefaultSettings();
    setDevOrangeIconOverride(true);
    expect(resolveActionIconState(settings, emptySession, [])).toBe('orange');
  });

  it('computes minimum display remaining across categories', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 90 * MS.MINUTE;
    settings.categories.push({
      ...settings.categories[0],
      id: 'social',
      remainingMs: 2 * MS.MINUTE,
    });
    expect(getMinimumDisplayRemainingMs(settings, emptySession)).toBe(2 * MS.MINUTE);
    expect(LOW_TIME_ICON_THRESHOLD_MS).toBe(5 * MS.MINUTE);
  });
});
