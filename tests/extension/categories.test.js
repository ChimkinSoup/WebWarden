import { describe, it, expect, beforeEach } from 'vitest';
import { findCategoryForUrl, isAuthDomain, isAllowedInAllowlistMode } from '../../extension/lib/categories.js';
import { createDefaultSettings } from '../../extension/lib/constants.js';

describe('categories', () => {
  let settings;

  beforeEach(() => {
    settings = createDefaultSettings();
  });

  it('matches blocklist sites to category', () => {
    const match = findCategoryForUrl('https://www.youtube.com/watch?v=1', settings);
    expect(match).not.toBeNull();
    expect(match.categoryId).toBe('default');
  });

  it('returns null for untracked sites in blocklist mode', () => {
    expect(findCategoryForUrl('https://example.com', settings)).toBeNull();
  });

  it('allows auth domains in allowlist mode', () => {
    settings.listMode = 'allowlist';
    expect(isAuthDomain('https://accounts.google.com/signin', settings)).toBe(true);
  });

  it('blocks non-allowed sites in allowlist mode', () => {
    settings.listMode = 'allowlist';
    expect(isAllowedInAllowlistMode('https://example.com', settings)).toBe(false);
  });

  it('resolves multiple categories independently', () => {
    settings.categories.push({
      id: 'social',
      name: 'Social',
      sites: ['facebook.com'],
      dailyLimitMs: 3600000,
      remainingMs: 3600000,
      lastResetDate: null,
    });
    const match = findCategoryForUrl('https://facebook.com', settings);
    expect(match.categoryId).toBe('social');
  });
});
