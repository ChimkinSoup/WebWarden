/**
 * Normalize a URL string to hostname (lowercase, no www).
 * @param {string} urlStr
 * @returns {string|null}
 */
export function extractHostname(urlStr) {
  if (!urlStr || urlStr.startsWith('chrome://') || urlStr.startsWith('chrome-extension://')) {
    return null;
  }
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if hostname matches a site pattern (domain or domain/path prefix).
 * @param {string} hostname
 * @param {string} pattern
 * @returns {boolean}
 */
export function hostnameMatchesPattern(hostname, pattern) {
  const p = pattern.toLowerCase().replace(/^www\./, '');
  if (p.includes('/')) {
    return false;
  }
  if (hostname === p) return true;
  return hostname.endsWith(`.${p}`);
}

/**
 * @param {string} urlStr
 * @param {string} pattern
 * @returns {boolean}
 */
export function urlMatchesPattern(urlStr, pattern) {
  const hostname = extractHostname(urlStr);
  if (!hostname) return false;
  const p = pattern.toLowerCase();
  if (p.includes('/')) {
    try {
      const url = new URL(urlStr);
      const pathPattern = p.startsWith('/') ? p : `/${p.split('/').slice(1).join('/')}`;
      const hostPart = p.split('/')[0].replace(/^www\./, '');
      if (hostname !== hostPart && !hostname.endsWith(`.${hostPart}`)) return false;
      return url.pathname.startsWith(pathPattern.replace(hostPart, '') || '/') ||
        url.pathname.startsWith('/' + p.split('/').slice(1).join('/'));
    } catch {
      return false;
    }
  }
  return hostnameMatchesPattern(hostname, p);
}

/**
 * @param {string} urlStr
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function urlMatchesAny(urlStr, patterns) {
  return patterns.some((p) => urlMatchesPattern(urlStr, p));
}
