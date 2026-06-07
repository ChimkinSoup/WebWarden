import { describe, it, expect } from 'vitest';
import {
  computeToastAlarms,
  toastMinutesForAlarm,
  formatRemainingToastMessage,
} from '../../extension/lib/alarms.js';
import { ALARM_NAMES, MS } from '../../extension/lib/constants.js';

describe('alarms', () => {
  it('schedules 30/5/1 minute toasts when limit >= 1 hour', () => {
    const remaining = 2 * MS.HOUR;
    const alarms = computeToastAlarms(remaining, remaining);
    const names = alarms.map((a) => a.name);
    expect(names).toContain(ALARM_NAMES.TOAST_30);
    expect(names).toContain(ALARM_NAMES.TOAST_5);
    expect(names).toContain(ALARM_NAMES.TOAST_1);
  });

  it('skips 30-minute toast when daily limit < 1 hour', () => {
    const remaining = 45 * MS.MINUTE;
    const alarms = computeToastAlarms(remaining, remaining);
    const names = alarms.map((a) => a.name);
    expect(names).not.toContain(ALARM_NAMES.TOAST_30);
    expect(names).toContain(ALARM_NAMES.TOAST_5);
  });

  it('maps toast alarm names to minutes', () => {
    expect(toastMinutesForAlarm(ALARM_NAMES.TOAST_30)).toBe(30);
    expect(toastMinutesForAlarm(ALARM_NAMES.TIME_UP)).toBeNull();
  });

  it('formats remaining toast messages', () => {
    expect(formatRemainingToastMessage(5, 'Social')).toBe('5 minutes remaining in Social.');
    expect(formatRemainingToastMessage(1, null)).toBe('1 minute remaining in this category.');
  });

  it('schedules 1-minute toast 10 seconds before time-up at 70s remaining', () => {
    const remaining = 70 * MS.SECOND;
    const alarms = computeToastAlarms(remaining, remaining);
    const toast1 = alarms.find((a) => a.name === ALARM_NAMES.TOAST_1);
    expect(toast1).toBeDefined();
    expect(toast1?.delayMs).toBe(10 * MS.SECOND);
  });
});
