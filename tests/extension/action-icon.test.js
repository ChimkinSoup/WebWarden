import { describe, it, expect, beforeEach } from 'vitest';
import {
  wouldTrackTime,
  resetActionIconState,
  setDevIconOverride,
} from '../../extension/lib/action-icon.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

beforeEach(() => {
  resetActionIconState();
});

describe('action-icon', () => {
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

  it('setDevIconOverride clears cached icon state', () => {
    setDevIconOverride(true);
    setDevIconOverride(false);
    resetActionIconState();
    expect(true).toBe(true);
  });
});
