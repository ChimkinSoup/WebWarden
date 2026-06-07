import { describe, it, expect } from 'vitest';
import { shouldActivateGuard, updateGuardState } from '../../extension/lib/incognito-guard.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('incognito-guard', () => {
  it('activates guard when companion disconnected', () => {
    const settings = createDefaultSettings();
    expect(shouldActivateGuard(updateGuardState(settings, false, true))).toBe(true);
  });

  it('activates guard when incognito not allowed', () => {
    const settings = createDefaultSettings();
    expect(shouldActivateGuard(updateGuardState(settings, true, false))).toBe(true);
  });

  it('deactivates guard when both ok', () => {
    const settings = createDefaultSettings();
    expect(shouldActivateGuard(updateGuardState(settings, true, true))).toBe(false);
  });
});
