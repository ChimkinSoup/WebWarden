/**
 * Normalize companion restart-check responses for the extension UI.
 * @param {object|null|undefined} resp
 * @returns {{ ok: true, granted: boolean, bootTimeMs: number, lastBootTimeMs: number } | { ok: false, error: string }}
 */
export function normalizeRestartCheckResponse(resp) {
  if (!resp) {
    return { ok: false, error: 'No response from companion' };
  }

  if (resp.ok === false || resp.error) {
    const message = String(resp.error || 'Companion rejected restart check');
    if (message.includes('Unknown message type')) {
      return {
        ok: false,
        error: 'Companion app is outdated and missing restart dev support. Run npm run build:companion, then reload the extension.',
      };
    }
    return { ok: false, error: message };
  }

  const bootTimeMs = Number(resp.bootTimeMs);
  if (!Number.isFinite(bootTimeMs) || bootTimeMs <= 0) {
    return {
      ok: false,
      error: 'Companion did not return a valid boot time. Rebuild with npm run build:companion.',
    };
  }

  return {
    ok: true,
    granted: Boolean(resp.granted),
    bootTimeMs,
    lastBootTimeMs: Number(resp.lastBootTimeMs) || 0,
  };
}

/**
 * @param {number|null|undefined} bootTimeMs
 * @returns {string}
 */
export function formatBootTimeMs(bootTimeMs) {
  if (!Number.isFinite(bootTimeMs) || bootTimeMs <= 0) {
    return 'unavailable';
  }
  const date = new Date(bootTimeMs);
  return Number.isNaN(date.getTime()) ? 'unavailable' : date.toLocaleString();
}
