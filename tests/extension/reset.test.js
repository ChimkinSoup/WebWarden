import { describe, it, expect } from 'vitest';
import { shouldRunDailyReset, applyDailyReset, getResetBoundaryDate } from '../../extension/lib/reset.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('reset', () => {
  it('computes reset boundary date before reset hour', () => {
    const now = new Date('2026-06-07T03:00:00');
    expect(getResetBoundaryDate(4, now)).toBe('2026-06-06');
  });

  it('computes reset boundary date after reset hour', () => {
    const now = new Date('2026-06-07T05:00:00');
    expect(getResetBoundaryDate(4, now)).toBe('2026-06-07');
  });

  it('runs daily reset when boundary changed', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;
    settings.lastGlobalResetDate = '2026-06-06';
    const now = new Date('2026-06-07T05:00:00');
    expect(shouldRunDailyReset(settings, now)).toBe(true);
    const reset = applyDailyReset(settings, now);
    expect(reset.categories[0].remainingMs).toBe(reset.categories[0].dailyLimitMs);
    expect(reset.emergencyPauseUsedDate).toBeNull();
  });
});
