import { describe, it, expect } from 'vitest';
import { canEditSettingsFreely, isDeveloperMode } from '../../extension/lib/friction.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('developer mode', () => {
  it('allows free edits when developer mode is on', () => {
    const settings = createDefaultSettings();
    settings.firstEditDone = true;
    settings.settingsLocked = true;
    settings.developerMode = true;
    expect(isDeveloperMode(settings)).toBe(true);
    expect(canEditSettingsFreely(settings)).toBe(true);
  });

  it('respects lock when developer mode is off', () => {
    const settings = createDefaultSettings();
    settings.firstEditDone = true;
    settings.settingsLocked = true;
    expect(canEditSettingsFreely(settings)).toBe(false);
  });
});
