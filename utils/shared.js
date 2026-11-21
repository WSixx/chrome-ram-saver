// =============================================================================
// RAM Saver — Shared Constants & Pure Utilities
// Universal module: works in Service Worker (importScripts), Browser (<script>),
// and Node/Jest (require).
// =============================================================================
(function (root) {
  'use strict';

  const ALARM_NAME = 'ram-saver-check';
  const RAM_PER_TAB_MB = 60;
  const SYSTEM_URL_PREFIXES = Object.freeze([
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'devtools://',
    'view-source:'
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    thresholdMinutes: 30,
    whitelist: [],
    whitelistUrls: [],
    userLanguage: 'auto',
    // Behavior toggles
    noSuspendAudio: true,
    noSuspendPinned: true,
    noSuspendForms: true,
    noSuspendGrouped: false,
    suspendOnMinimize: false,
    // Advanced
    lazyLoadStartup: true,
    activeTabLimit: false,
    activeTabLimitCount: 20,
    aggressiveMode: false,
    // Badge & Indicators
    showBadge: true,
    markSuspendedTitle: true
  });

  /**
   * Normalizes a URL by stripping query string, hash, and trailing slash.
   * @param {string} url
   * @returns {string}
   */
  function normalizeUrl(url) {
    if (typeof url !== 'string') return '';
    try {
      const u = new URL(url.trim());
      return `${u.origin}${u.pathname}`.replace(/\/$/, '');
    } catch {
      return url.trim();
    }
  }

  /**
   * Normalizes a domain string by stripping protocol, www, path, and port.
   * @param {string} d
   * @returns {string}
   */
  function normalizeDomain(d) {
    if (typeof d !== 'string') return '';
    return d
      .trim()
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .split('/')[0]
      .replace(/:\d+$/, '');
  }

  /**
   * Returns true if the string is a valid domain (no unsupported protocol, valid labels & TLD).
   * @param {string} d
   * @returns {boolean}
   */
  function isValidDomain(d) {
    if (typeof d !== 'string') return false;
    const clean = d
      .trim()
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .split('/')[0];
    if (!clean || clean.length > 253) return false;
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(clean);
  }

  /**
   * Returns true if the string is a valid http/https URL.
   * @param {string} u
   * @returns {boolean}
   */
  function isValidUrl(u) {
    if (typeof u !== 'string') return false;
    try {
      const p = new URL(u.trim());
      return p.protocol === 'https:' || p.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /**
   * Returns true if the URL is a Chrome/system internal URL.
   * @param {string|null|undefined} url
   * @returns {boolean}
   */
  function isSystemUrl(url) {
    if (!url) return true;
    return SYSTEM_URL_PREFIXES.some((p) => url.startsWith(p));
  }

  /**
   * Returns true if the tab belongs to a Chrome tab group.
   * @param {object} tab
   * @returns {boolean}
   */
  function isTabInGroup(tab) {
    return Boolean(tab) && typeof tab.groupId === 'number' && tab.groupId > -1;
  }

  /**
   * Returns the matching whitelist domain entry for the given URL, or null.
   * Handles subdomains and www prefix.
   * @param {string} url
   * @param {string[]} whitelist
   * @returns {string|null}
   */
  function findMatchingDomain(url, whitelist) {
    if (!url || !Array.isArray(whitelist) || whitelist.length === 0) return null;
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (!hostname) return null;
      return whitelist.find((d) => {
        if (typeof d !== 'string') return false;
        const dom = d.toLowerCase().trim().replace(/^www\./, '');
        return Boolean(dom) && (hostname === dom || hostname.endsWith(`.${dom}`));
      }) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Returns true if the given URL's hostname matches any whitelisted domain.
   * @param {string} url
   * @param {string[]} whitelist
   * @returns {boolean}
   */
  function isDomainWhitelisted(url, whitelist) {
    return findMatchingDomain(url, whitelist) !== null;
  }

  /**
   * Returns the matching whitelist URL entry for the given URL, or null.
   * Enforces path-segment boundaries so /app does not match /apple and
   * https://a.com does not match https://a.com.evil.com.
   * @param {string} url
   * @param {string[]} whitelistUrls
   * @returns {string|null}
   */
  function findMatchingUrl(url, whitelistUrls) {
    if (!url || !Array.isArray(whitelistUrls) || whitelistUrls.length === 0) return null;
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    return whitelistUrls.find((entry) => {
      if (typeof entry !== 'string' || !entry) return false;
      const normalizedEntry = normalizeUrl(entry);
      return Boolean(normalizedEntry) && (
        normalized === normalizedEntry || normalized.startsWith(`${normalizedEntry}/`)
      );
    }) ?? null;
  }

  /**
   * Returns true if the normalized URL matches any whitelisted URL prefix at a path boundary.
   * @param {string} url
   * @param {string[]} whitelistUrls
   * @returns {boolean}
   */
  function isUrlWhitelisted(url, whitelistUrls) {
    return findMatchingUrl(url, whitelistUrls) !== null;
  }

  /**
   * Determines whether a tab is immune from suspension (ignoring inactivity time).
   * @param {object} tab
   * @param {object} settings
   * @param {boolean} [isExempt=false]
   * @returns {boolean}
   */
  function isTabImmune(tab, settings, isExempt = false) {
    if (!tab) return true;
    if (isExempt) return true;
    if (settings?.noSuspendPinned && tab.pinned) return true;
    if (settings?.noSuspendAudio && tab.audible) return true;
    if (settings?.noSuspendGrouped && isTabInGroup(tab)) return true;
    if (!tab.url || tab.url === 'about:blank' || isSystemUrl(tab.url)) return true;
    if (isDomainWhitelisted(tab.url, settings?.whitelist)) return true;
    if (isUrlWhitelisted(tab.url, settings?.whitelistUrls)) return true;
    return false;
  }

  /**
   * Determines whether a tab is eligible for suspension given the current settings.
   * @param {object} tab - Chrome Tab object
   * @param {object} settings - Extension settings
   * @param {number} lastActiveMs - Timestamp when tab was last active (ms since epoch)
   * @param {number} nowMs - Current timestamp (ms since epoch)
   * @param {boolean} [forceAll=false] - If true, ignore the time threshold
   * @param {boolean} [isExempt=false] - If true, tab is session-exempt
   * @param {boolean} [hasUnsavedForm=false] - If true, tab has unsaved form inputs
   * @returns {{ eligible: boolean, reason: string }}
   */
  function isTabEligible(
    tab,
    settings,
    lastActiveMs,
    nowMs,
    forceAll = false,
    isExempt = false,
    hasUnsavedForm = false
  ) {
    if (!tab) return { eligible: false, reason: 'invalid_tab' };
    if (tab.active) return { eligible: false, reason: 'active' };
    if (tab.discarded) return { eligible: false, reason: 'already_discarded' };
    if (isExempt) return { eligible: false, reason: 'tab_exempt' };
    if (settings.noSuspendPinned && tab.pinned) return { eligible: false, reason: 'pinned' };
    if (settings.noSuspendAudio && tab.audible) return { eligible: false, reason: 'audible' };
    if (settings.noSuspendForms && hasUnsavedForm) return { eligible: false, reason: 'unsaved_form' };
    if (settings.noSuspendGrouped && isTabInGroup(tab)) {
      return { eligible: false, reason: 'grouped' };
    }
    if (!tab.url || tab.url === 'about:blank') return { eligible: false, reason: 'no_url' };
    if (isSystemUrl(tab.url)) return { eligible: false, reason: 'system_url' };
    if (isDomainWhitelisted(tab.url, settings.whitelist)) {
      return { eligible: false, reason: 'domain_whitelisted' };
    }
    if (isUrlWhitelisted(tab.url, settings.whitelistUrls)) {
      return { eligible: false, reason: 'url_whitelisted' };
    }

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

  const RamSaverUtils = Object.freeze({
    ALARM_NAME,
    RAM_PER_TAB_MB,
    SYSTEM_URL_PREFIXES,
    DEFAULT_SETTINGS,
    normalizeUrl,
    normalizeDomain,
    isValidDomain,
    isValidUrl,
    isSystemUrl,
    isTabInGroup,
    findMatchingDomain,
    isDomainWhitelisted,
    findMatchingUrl,
    isUrlWhitelisted,
    isTabImmune,
    isTabEligible
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RamSaverUtils;
  }
  if (root) {
    root.RamSaverUtils = RamSaverUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
