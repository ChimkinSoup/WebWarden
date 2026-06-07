import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionState, resetSessionState } from '../../extension/lib/time-engine.js';
import { createDefaultSettings, MS } from '../../extension/lib/constants.js';

function buildPopupCategories(settings, sessionElapsed, session) {
  return settings.categories.map((cat) => {
    let displayRemainingMs = cat.remainingMs;
    if (session.isConsumingTime && session.activeCategoryId === cat.id) {
      displayRemainingMs = Math.max(0, cat.remainingMs - sessionElapsed);
    }
    return {
      id: cat.id,
      name: cat.name,
      dailyLimitMs: cat.dailyLimitMs,
      remainingMs: cat.remainingMs,
      displayRemainingMs,
    };
  });
}

beforeEach(() => {
  resetSessionState();
});

describe('popup remaining display', () => {
  it('subtracts active session elapsed time from displayed remaining', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 5 * MS.MINUTE;
    const session = {
      isConsumingTime: true,
      activeCategoryId: 'default',
      sessionStartMs: Date.now() - 30 * MS.SECOND,
      activeDomain: 'youtube.com',
    };

    const categories = buildPopupCategories(settings, 30 * MS.SECOND, session);
    expect(categories[0].displayRemainingMs).toBe(4.5 * MS.MINUTE);
  });

  it('does not adjust categories that are not actively tracking', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 5 * MS.MINUTE;
    const session = getSessionState();

    const categories = buildPopupCategories(settings, 0, session);
    expect(categories[0].displayRemainingMs).toBe(5 * MS.MINUTE);
  });
});
