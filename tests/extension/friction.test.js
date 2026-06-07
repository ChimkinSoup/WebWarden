import { describe, it, expect } from 'vitest';
import {
  generateChallenge,
  validateChar,
  isChallengeComplete,
  acceptsDevBypassChar,
  isDevBypassComplete,
  isFrictionChallengePassed,
  DEV_BYPASS_PHRASE,
} from '../../extension/lib/friction.js';

describe('friction', () => {
  it('generates 100-char string without spaces', () => {
    const c = generateChallenge();
    expect(c.length).toBe(100);
    expect(c).not.toMatch(/\s/);
  });

  it('validates char by index', () => {
    const c = 'abc';
    expect(validateChar(c, 0, 'a')).toBe(true);
    expect(validateChar(c, 1, 'x')).toBe(false);
  });

  it('detects complete challenge', () => {
    const c = generateChallenge();
    expect(isChallengeComplete(c, c)).toBe(true);
    expect(isChallengeComplete(c, c.slice(0, 50))).toBe(false);
  });

  it('accepts dev bypass phrase', () => {
    expect(acceptsDevBypassChar('', 'd')).toBe(true);
    expect(acceptsDevBypassChar('d', 'e')).toBe(true);
    expect(acceptsDevBypassChar('de', 'v')).toBe(true);
    expect(acceptsDevBypassChar('de', 'x')).toBe(false);
    expect(isDevBypassComplete(DEV_BYPASS_PHRASE)).toBe(true);
    expect(isFrictionChallengePassed(DEV_BYPASS_PHRASE)).toBe(true);
  });
});
