import { describe, it, expect } from 'vitest';
import {
  mergeSitesAllowAddOnly,
  enforceSiteAddOnly,
  enforceCategoriesSiteAddOnly,
} from '../../extension/lib/site-list-editor.js';

describe('site-list-editor', () => {
  it('appends new sites without changing originals', () => {
    expect(mergeSitesAllowAddOnly(['youtube.com', 'instagram.com'], ['reddit.com']))
      .toEqual(['youtube.com', 'instagram.com', 'reddit.com']);
  });

  it('ignores duplicate additions', () => {
    expect(mergeSitesAllowAddOnly(['youtube.com'], ['YouTube.com', 'reddit.com']))
      .toEqual(['youtube.com', 'reddit.com']);
  });

  it('rejects edits to existing sites', () => {
    expect(enforceSiteAddOnly(
      ['youtube.com', 'instagram.com'],
      ['youtube.com', 'tiktok.com', 'reddit.com'],
    )).toEqual(['youtube.com', 'instagram.com', 'reddit.com']);
  });

  it('rejects removals of existing sites', () => {
    expect(enforceSiteAddOnly(['youtube.com', 'instagram.com'], ['youtube.com']))
      .toEqual(['youtube.com', 'instagram.com']);
  });

  it('enforces add-only per category', () => {
    const original = [{ id: 'a', sites: ['youtube.com'] }];
    const incoming = [{ id: 'a', sites: ['evil.com', 'reddit.com'] }];
    expect(enforceCategoriesSiteAddOnly(original, incoming)[0].sites)
      .toEqual(['youtube.com', 'reddit.com']);
  });
});
