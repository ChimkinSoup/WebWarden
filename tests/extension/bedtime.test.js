import { describe, it, expect } from 'vitest';
import { isBedtimeActive, isHardcoreBedtime } from '../../extension/lib/bedtime.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('bedtime', () => {
  it('detects overnight bedtime range', () => {
    const settings = createDefaultSettings();
    settings.bedtime.enabled = true;
    settings.bedtime.start = '23:00';
    settings.bedtime.end = '07:00';
    expect(isBedtimeActive(settings, new Date('2026-06-07T23:30:00'))).toBe(true);
    expect(isBedtimeActive(settings, new Date('2026-06-07T12:00:00'))).toBe(false);
  });

  it('detects same-day bedtime range', () => {
    const settings = createDefaultSettings();
    settings.bedtime.enabled = true;
    settings.bedtime.start = '13:00';
    settings.bedtime.end = '15:00';
    expect(isBedtimeActive(settings, new Date('2026-06-07T14:00:00'))).toBe(true);
  });

  it('hardcore bedtime requires enabled bedtime', () => {
    const settings = createDefaultSettings();
    settings.bedtime.enabled = true;
    settings.bedtime.hardcore = true;
    settings.bedtime.start = '23:00';
    settings.bedtime.end = '07:00';
    expect(isHardcoreBedtime(settings)).toBe(false);
    expect(isHardcoreBedtime(settings, new Date('2026-06-07T23:30:00'))).toBe(true);
  });
});
