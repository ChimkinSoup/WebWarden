/**
 * @param {string} site
 * @returns {string}
 */
export function normalizeSite(site) {
  return site.trim().toLowerCase();
}

/**
 * Keep original sites unchanged; append only new domains.
 * @param {string[]} originalSites
 * @param {string[]} additions
 * @returns {string[]}
 */
export function mergeSitesAllowAddOnly(originalSites, additions) {
  const seen = new Set(originalSites.map(normalizeSite));
  const result = [...originalSites];

  for (const site of additions) {
    const trimmed = site.trim();
    const norm = normalizeSite(trimmed);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    result.push(trimmed);
  }

  return result;
}

/**
 * Reject edits/removals to existing sites; allow append-only changes.
 * @param {string[]} originalSites
 * @param {string[]} incomingSites
 * @returns {string[]}
 */
export function enforceSiteAddOnly(originalSites, incomingSites) {
  const originalNorm = originalSites.map(normalizeSite);

  for (let i = 0; i < originalNorm.length; i++) {
    if (normalizeSite(incomingSites[i] ?? '') !== originalNorm[i]) {
      const additions = incomingSites.slice(originalNorm.length);
      return mergeSitesAllowAddOnly(originalSites, additions);
    }
  }

  const additions = incomingSites.slice(originalNorm.length);
  return mergeSitesAllowAddOnly(originalSites, additions);
}

/**
 * @param {import('./constants.js').Settings['categories']} originalCategories
 * @param {import('./constants.js').Settings['categories']} incomingCategories
 * @returns {import('./constants.js').Settings['categories']}
 */
export function enforceCategoriesSiteAddOnly(originalCategories, incomingCategories) {
  const incomingById = new Map(incomingCategories.map((c) => [c.id, c]));

  return originalCategories.map((originalCat) => {
    const incomingCat = incomingById.get(originalCat.id);
    if (!incomingCat) return { ...originalCat };

    return {
      ...originalCat,
      sites: enforceSiteAddOnly(originalCat.sites, incomingCat.sites || []),
    };
  });
}
