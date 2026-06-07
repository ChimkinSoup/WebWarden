import { describe, it, expect } from 'vitest';
import { normalizeRestartCheckResponse, formatBootTimeMs } from '../../extension/lib/restart-response.js';

describe('restart-response', () => {
  it('flags outdated companion responses', () => {
    const result = normalizeRestartCheckResponse({
      ok: false,
      error: 'Unknown message type',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('outdated');
    }
  });

  it('accepts valid restart check payloads', () => {
    const result = normalizeRestartCheckResponse({
      ok: true,
      granted: true,
      bootTimeMs: 1_780_868_405_018,
      lastBootTimeMs: 0,
    });
    expect(result).toEqual({
      ok: true,
      granted: true,
      bootTimeMs: 1_780_868_405_018,
      lastBootTimeMs: 0,
    });
  });

  it('formats boot timestamps safely', () => {
    expect(formatBootTimeMs(undefined)).toBe('unavailable');
    expect(formatBootTimeMs(1_780_868_405_018)).not.toBe('unavailable');
  });
});
