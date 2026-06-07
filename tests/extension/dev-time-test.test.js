import { describe, it, expect } from 'vitest';
import {
  enableDevTenSecondTest,
  disableDevTenSecondTest,
  setDevTenSecondTest,
  clearDevTenSecondTestIfActive,
  enableDevLiveToastTest,
  disableDevLiveToastTest,
  clearDevLiveToastTestIfActive,
  finalizeDeveloperModeSave,
  DEV_TEN_SECOND_TEST_MS,
  DEV_LIVE_TOAST_TEST_MS,
} from '../../extension/lib/dev-time-test.js';
import { createDefaultSettings, MS } from '../../extension/lib/constants.js';

describe('dev-time-test', () => {
  it('sets all categories to 10 seconds and snapshots remaining time', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 90 * MS.MINUTE;

    enableDevTenSecondTest(settings);

    expect(settings.devTenSecondTest).toBe(true);
    expect(settings.devTenSecondTestSnapshot.default).toBe(90 * MS.MINUTE);
    expect(settings.categories[0].remainingMs).toBe(DEV_TEN_SECOND_TEST_MS);
  });

  it('restores snapshot when disabled', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 45 * MS.MINUTE;
    enableDevTenSecondTest(settings);
    settings.categories[0].remainingMs = 0;

    disableDevTenSecondTest(settings);

    expect(settings.devTenSecondTest).toBe(false);
    expect(settings.devTenSecondTestSnapshot).toBeNull();
    expect(settings.categories[0].remainingMs).toBe(45 * MS.MINUTE);
  });

  it('re-snapshots current remaining time each time it is enabled', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 60 * MS.MINUTE;

    setDevTenSecondTest(settings, true);
    setDevTenSecondTest(settings, false);
    settings.categories[0].remainingMs = 30 * MS.MINUTE;
    setDevTenSecondTest(settings, true);

    expect(settings.devTenSecondTestSnapshot.default).toBe(30 * MS.MINUTE);
    expect(settings.categories[0].remainingMs).toBe(DEV_TEN_SECOND_TEST_MS);
  });

  it('clears active test when developer mode ends', () => {
    const settings = createDefaultSettings();
    enableDevTenSecondTest(settings);

    clearDevTenSecondTestIfActive(settings);

    expect(settings.devTenSecondTest).toBe(false);
    expect(settings.categories[0].remainingMs).toBe(2 * MS.HOUR);
  });

  it('arms live toast test at 70 seconds and snapshots remaining time', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 90 * MS.MINUTE;

    enableDevLiveToastTest(settings);

    expect(settings.devLiveToastTest).toBe(true);
    expect(settings.devLiveToastTestSnapshot.default).toBe(90 * MS.MINUTE);
    expect(settings.categories[0].remainingMs).toBe(DEV_LIVE_TOAST_TEST_MS);
  });

  it('restores live toast snapshot when disabled', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 45 * MS.MINUTE;
    enableDevLiveToastTest(settings);

    disableDevLiveToastTest(settings);

    expect(settings.devLiveToastTest).toBe(false);
    expect(settings.categories[0].remainingMs).toBe(45 * MS.MINUTE);
  });

  it('clears live toast test when developer mode ends', () => {
    const settings = createDefaultSettings();
    enableDevLiveToastTest(settings);

    clearDevLiveToastTestIfActive(settings);

    expect(settings.devLiveToastTest).toBe(false);
    expect(settings.categories[0].remainingMs).toBe(2 * MS.HOUR);
  });

  it('finalizeDeveloperModeSave clears dev tests and restores daily limits', () => {
    const settings = createDefaultSettings();
    settings.categories[0].dailyLimitMs = 60 * MS.MINUTE;
    enableDevLiveToastTest(settings);
    settings.categories[0].remainingMs = 54 * MS.SECOND;

    finalizeDeveloperModeSave(settings);

    expect(settings.devLiveToastTest).toBe(false);
    expect(settings.devTenSecondTest).toBe(false);
    expect(settings.categories[0].remainingMs).toBe(60 * MS.MINUTE);
  });
});
