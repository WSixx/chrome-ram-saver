// =============================================================================
// tests/helpers/utils.js
// Pure utility functions extracted from the extension for unit testing.
// These mirror the implementations in background/service-worker.js and
// options/options.js exactly — keep them in sync when the source changes.
// =============================================================================

// ---------------------------------------------------------------------------
// URL utilities (mirrors service-worker.js)
// ---------------------------------------------------------------------------

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://',
  'about:', 'devtools://', 'view-source:'
];

/**
 * Normalizes a URL by stripping query string and hash.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch { return url; }
}

/**
 * Returns true if the given URL's hostname matches any whitelisted domain.
 * Handles subdomains and www prefix.
 * @param {string} url
 * @param {string[]} whitelist
 * @returns {boolean}
 */
function isDomainWhitelisted(url, whitelist) {
  if (!url || !whitelist?.length) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return whitelist.some(d => {
      const dom = d.toLowerCase().trim().replace(/^www\./, '');
      return hostname === dom || hostname.endsWith(`.${dom}`);
    });
  } catch { return false; }
}

/**
 * Returns true if the normalized URL matches or starts with any whitelisted URL.
 * @param {string} url
 * @param {string[]} whitelistUrls
 * @returns {boolean}
 */
function isUrlWhitelisted(url, whitelistUrls) {
  if (!url || !whitelistUrls?.length) return false;
  const normalized = normalizeUrl(url);
  return whitelistUrls.some(u => normalized === u || normalized.startsWith(u));
}

/**
 * Returns true if the URL is a Chrome/system internal URL.
 * @param {string|null} url
 * @returns {boolean}
 */
function isSystemUrl(url) {
  if (!url) return true;
  return SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
}

/**
 * Determines whether a tab is eligible for suspension given the current settings.
 * @param {object} tab - Chrome Tab object
 * @param {object} settings - Extension settings
 * @param {number} lastActiveMs - Timestamp when tab was last active (ms since epoch)
 * @param {number} nowMs - Current timestamp (ms since epoch)
 * @param {boolean} [forceAll=false] - If true, ignore the time threshold
 * @returns {{ eligible: boolean, reason: string }}
 */
function isTabEligible(tab, settings, lastActiveMs, nowMs, forceAll = false, isExempt = false, hasUnsavedForm = false) {
  if (tab.active)    return { eligible: false, reason: 'active' };
  if (tab.discarded) return { eligible: false, reason: 'already_discarded' };
  if (isExempt)      return { eligible: false, reason: 'tab_exempt' };
  if (settings.noSuspendPinned && tab.pinned)  return { eligible: false, reason: 'pinned' };
  if (settings.noSuspendAudio  && tab.audible) return { eligible: false, reason: 'audible' };
  if (settings.noSuspendForms  && hasUnsavedForm) return { eligible: false, reason: 'unsaved_form' };
  if (settings.noSuspendGrouped && typeof tab.groupId === 'number' && tab.groupId > -1) {
    return { eligible: false, reason: 'grouped' };
  }
  if (isSystemUrl(tab.url))                    return { eligible: false, reason: 'system_url' };
  if (!tab.url || tab.url === 'about:blank')   return { eligible: false, reason: 'no_url' };
  if (isDomainWhitelisted(tab.url, settings.whitelist))    return { eligible: false, reason: 'domain_whitelisted' };
  if (isUrlWhitelisted(tab.url, settings.whitelistUrls))   return { eligible: false, reason: 'url_whitelisted' };

  const effectiveThreshold = settings.aggressiveMode
    ? Math.min(settings.thresholdMinutes, 5)
    : settings.thresholdMinutes;

  const thresholdMs = effectiveThreshold * 60 * 1000;
  const inactiveMs = nowMs - lastActiveMs;

  if (!forceAll && inactiveMs < thresholdMs) {
    return { eligible: false, reason: 'not_yet_inactive' };
  }

  return { eligible: true, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// Validation utilities (mirrors options/options.js)
// ---------------------------------------------------------------------------

/**
 * Returns true if the string is a valid domain (no protocol, no path).
 * @param {string} d
 * @returns {boolean}
 */
function isValidDomain(d) {
  const clean = d.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(clean);
}

/**
 * Normalizes a domain string by stripping protocol, www, and path.
 * @param {string} d
 * @returns {string}
 */
function normalizeDomain(d) {
  return d.trim().toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0];
}

/**
 * Returns true if the string is a valid http/https URL.
 * @param {string} u
 * @returns {boolean}
 */
function isValidUrl(u) {
  try {
    const p = new URL(u.trim());
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch { return false; }
}

module.exports = {
  normalizeUrl,
  isDomainWhitelisted,
  isUrlWhitelisted,
  isSystemUrl,
  isTabEligible,
  isValidDomain,
  normalizeDomain,
  isValidUrl
};
