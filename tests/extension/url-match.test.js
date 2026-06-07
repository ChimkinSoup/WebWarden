import { describe, it, expect } from 'vitest';
import { extractHostname, hostnameMatchesPattern, urlMatchesPattern } from '../../extension/lib/url-match.js';

describe('url-match', () => {
  it('extracts hostname without www', () => {
    expect(extractHostname('https://www.youtube.com/watch')).toBe('youtube.com');
  });

  it('returns null for chrome URLs', () => {
    expect(extractHostname('chrome://settings')).toBeNull();
  });

  it('matches subdomain patterns', () => {
    expect(hostnameMatchesPattern('m.youtube.com', 'youtube.com')).toBe(true);
  });

  it('matches exact domain', () => {
    expect(urlMatchesPattern('https://instagram.com/user', 'instagram.com')).toBe(true);
  });
});
