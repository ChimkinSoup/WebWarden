import { describe, it, expect } from 'vitest';
import { buildDnrRules, patternToUrlFilter } from '../../extension/lib/dnr.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('dnr', () => {
  it('converts domain pattern to urlFilter', () => {
    expect(patternToUrlFilter('youtube.com')).toBe('*://*.youtube.com/*');
  });

  it('builds blocklist rules when time exhausted', () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;
    const rules = buildDnrRules(settings, 'test-id');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].action.type).toBe('redirect');
  });

  it('builds allowlist catchall rule', () => {
    const settings = createDefaultSettings();
    settings.listMode = 'allowlist';
    const rules = buildDnrRules(settings, 'test-id');
    expect(rules.some((r) => r.id === 9000)).toBe(true);
  });

  it('assigns unique rule IDs in guard mode', () => {
    const settings = createDefaultSettings();
    settings.guardActive = true;
    settings.categories.push({
      id: 'social',
      name: 'Social',
      sites: ['youtube.com', 'instagram.com'],
      dailyLimitMs: 3600000,
      remainingMs: 3600000,
      lastResetDate: null,
    });
    const rules = buildDnrRules(settings, 'test-id');
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
