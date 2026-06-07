import { describe, it, expect } from 'vitest';
import { getBlockStatus, canUseEmergencyPause } from '../../extension/lib/block-logic.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('block-logic', () => {
  it('blocks when category time exhausted', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;
    const status = getBlockStatus('https://youtube.com', settings);
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe('time-up');
  });

  it('allows when time remains', () => {
    const settings = createDefaultSettings();
    const status = getBlockStatus('https://youtube.com', settings);
    expect(status.blocked).toBe(false);
  });

  it('activates guard when companion unreachable', () => {
    const settings = createDefaultSettings();
    settings.guardActive = true;
    const status = getBlockStatus('https://youtube.com', settings);
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe('guard');
  });

  it('allows emergency pause when time exhausted and not used', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;
    expect(canUseEmergencyPause(settings, 'default')).toBe(true);
  });
});
