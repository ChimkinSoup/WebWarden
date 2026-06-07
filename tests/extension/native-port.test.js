import { describe, it, expect } from 'vitest';

describe('native messaging requestId matching', () => {
  it('matches response to payload requestId not original message', () => {
    const message = { type: 'PING' };
    const requestId = message.requestId || 'generated-id';
    const payload = { ...message, requestId };

    const response = { ok: true, requestId: 'generated-id', type: 'PING' };

    expect(response.requestId === message.requestId).toBe(false);
    expect(response.requestId === payload.requestId).toBe(true);
  });
});
