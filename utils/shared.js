// =============================================================================
// RAM Saver — Shared Constants & Pure Utilities
// Universal module: works in Service Worker (importScripts), Browser (<script>),
// and Node/Jest (require).
// =============================================================================
(function (root) {
  'use strict';

  const ALARM_NAME = 'ram-saver-check';
  const RAM_PER_TAB_MB = 60;
  const MIN_ALARM_DELAY_MS = 30 * 1000;
  const DIRTY_FORM_COOLDOWN_MS = 5 * 60 * 1000;
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
   * Extracts a lowercase hostname without leading www. from a URL string.
   * Returns empty string for invalid URLs or URLs without a hostname (e.g. file://).
   * @param {string} url
   * @returns {string}
   */
  function extractHostname(url) {
    if (typeof url !== 'string' || !url) return '';
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
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
    for (let i = 0; i < SYSTEM_URL_PREFIXES.length; i++) {
      if (url.startsWith(SYSTEM_URL_PREFIXES[i])) return true;
    }
    return false;
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
   * Precompiles domain and URL whitelists into O(1) lookup maps so repeated checks
   * across many tabs avoid re-parsing every whitelist entry on every tab.
   * @param {string[]} whitelist
   * @param {string[]} whitelistUrls
   * @returns {{ domains: Map<string, string>, urlsByOrigin: Map<string, Array<{ normalized: string, raw: string }>> }}
   */
  function compileWhitelist(whitelist, whitelistUrls) {
    const domains = new Map();
    if (Array.isArray(whitelist)) {
      for (let i = 0; i < whitelist.length; i++) {
        const entry = whitelist[i];
        if (typeof entry !== 'string') continue;
        const dom = entry.toLowerCase().trim().replace(/^www\./, '');
        if (dom && !domains.has(dom)) {
          domains.set(dom, entry);
        }
      }
    }

    const urlsByOrigin = new Map();
    if (Array.isArray(whitelistUrls)) {
      for (let i = 0; i < whitelistUrls.length; i++) {
        const entry = whitelistUrls[i];
        if (typeof entry !== 'string' || !entry) continue;
        const trimmed = entry.trim();
        if (!trimmed) continue;
        let origin = '';
        let normalized = trimmed;
        try {
          const parsed = new URL(trimmed);
          origin = parsed.origin;
          normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
        } catch {
          // Keep raw trimmed string under '' bucket for backwards compatibility
        }
        if (!normalized) continue;
        let bucket = urlsByOrigin.get(origin);
        if (!bucket) {
          bucket = [];
          urlsByOrigin.set(origin, bucket);
        }
        bucket.push({ normalized, raw: entry });
      }
    }

    return { domains, urlsByOrigin };
  }

  function matchHostnameCompiled(hostname, domainsMap) {
    if (!hostname || !domainsMap || domainsMap.size === 0) return null;
    let candidate = hostname;
    while (candidate) {
      const hit = domainsMap.get(candidate);
      if (hit !== undefined) return hit;
      const dotIdx = candidate.indexOf('.');
      if (dotIdx === -1) break;
      candidate = candidate.slice(dotIdx + 1);
    }
    return null;
  }

  function matchUrlCompiled(url, urlsByOrigin, parsedUrl) {
    if (!url || !urlsByOrigin || urlsByOrigin.size === 0) return null;
    let origin = '';
    let normalized = '';
    if (parsedUrl) {
      origin = parsedUrl.origin;
      normalized = `${parsedUrl.origin}${parsedUrl.pathname}`.replace(/\/$/, '');
    } else {
      try {
        const parsed = new URL(url.trim());
        origin = parsed.origin;
        normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
      } catch {
        normalized = url.trim();
      }
    }
    if (!normalized) return null;
    const bucket = urlsByOrigin.get(origin);
    if (!bucket) return null;
    for (let i = 0; i < bucket.length; i++) {
      const { normalized: normalizedEntry, raw } = bucket[i];
      if (normalized === normalizedEntry || normalized.startsWith(`${normalizedEntry}/`)) {
        return raw;
      }
    }
    return null;
  }

  /**
   * Returns the matching whitelist domain entry for the given URL, or null.
   * Accepts either a raw string[] whitelist or a compiled matcher from compileWhitelist().
   * @param {string} url
   * @param {string[]|{ domains: Map<string, string> }} whitelist
   * @returns {string|null}
   */
  function findMatchingDomain(url, whitelist) {
    if (!url || !whitelist) return null;
    if (whitelist.domains instanceof Map) {
      if (whitelist.domains.size === 0) return null;
      const hostname = extractHostname(url);
      return matchHostnameCompiled(hostname, whitelist.domains);
    }
    if (!Array.isArray(whitelist) || whitelist.length === 0) return null;
    const hostname = extractHostname(url);
    if (!hostname) return null;
    for (let i = 0; i < whitelist.length; i++) {
      const d = whitelist[i];
      if (typeof d !== 'string') continue;
      const dom = d.toLowerCase().trim().replace(/^www\./, '');
      if (dom && (hostname === dom || hostname.endsWith(`.${dom}`))) {
        return d;
      }
    }
    return null;
  }

  /**
   * Returns true if the given URL's hostname matches any whitelisted domain.
   * @param {string} url
   * @param {string[]|{ domains: Map<string, string> }} whitelist
   * @returns {boolean}
   */
  function isDomainWhitelisted(url, whitelist) {
    return findMatchingDomain(url, whitelist) !== null;
  }

  /**
   * Returns the matching whitelist URL entry for the given URL, or null.
   * Enforces path-segment boundaries so /app does not match /apple and
   * https://a.com does not match https://a.com.evil.com.
   * Accepts either a raw string[] whitelist or a compiled matcher from compileWhitelist().
   * @param {string} url
   * @param {string[]|{ urlsByOrigin: Map<string, Array> }} whitelistUrls
   * @returns {string|null}
   */
  function findMatchingUrl(url, whitelistUrls) {
    if (!url || !whitelistUrls) return null;
    if (whitelistUrls.urlsByOrigin instanceof Map) {
      return matchUrlCompiled(url, whitelistUrls.urlsByOrigin, null);
    }
    if (!Array.isArray(whitelistUrls) || whitelistUrls.length === 0) return null;
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    for (let i = 0; i < whitelistUrls.length; i++) {
      const entry = whitelistUrls[i];
      if (typeof entry !== 'string' || !entry) continue;
      const normalizedEntry = normalizeUrl(entry);
      if (
        normalizedEntry &&
        (normalized === normalizedEntry || normalized.startsWith(`${normalizedEntry}/`))
      ) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Returns true if the normalized URL matches any whitelisted URL prefix at a path boundary.
   * @param {string} url
   * @param {string[]|{ urlsByOrigin: Map<string, Array> }} whitelistUrls
   * @returns {boolean}
   */
  function isUrlWhitelisted(url, whitelistUrls) {
    return findMatchingUrl(url, whitelistUrls) !== null;
  }

  /**
   * Checks a tab URL against compiled whitelist maps with at most one URL parse.
   * Returns 'domain', 'url', or null.
   * @param {string} url
   * @param {{ domains: Map<string, string>, urlsByOrigin: Map<string, Array> }} compiled
   * @returns {'domain'|'url'|null}
   */
  function matchCompiledWhitelist(url, compiled) {
    const hasDomains = compiled.domains.size > 0;
    const hasUrls = compiled.urlsByOrigin.size > 0;
    if (!hasDomains && !hasUrls) return null;

    let parsedUrl = null;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      parsedUrl = null;
    }

    if (hasDomains && parsedUrl) {
      const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
      if (matchHostnameCompiled(hostname, compiled.domains) !== null) {
        return 'domain';
      }
    }

    if (hasUrls && matchUrlCompiled(url, compiled.urlsByOrigin, parsedUrl) !== null) {
      return 'url';
    }

    return null;
  }

  /**
   * Determines whether a tab is immune from suspension (ignoring inactivity time).
   * @param {object} tab
   * @param {object} settings
   * @param {boolean} [isExempt=false]
   * @param {{ domains: Map<string, string>, urlsByOrigin: Map<string, Array> }|null} [compiledWhitelist=null]
   * @returns {boolean}
   */
  function isTabImmune(tab, settings, isExempt = false, compiledWhitelist = null) {
    if (!tab) return true;
    if (isExempt) return true;
    if (settings?.noSuspendPinned && tab.pinned) return true;
    if (settings?.noSuspendAudio && tab.audible) return true;
    if (settings?.noSuspendGrouped && isTabInGroup(tab)) return true;
    if (!tab.url || tab.url === 'about:blank' || isSystemUrl(tab.url)) return true;
    if (compiledWhitelist) {
      return matchCompiledWhitelist(tab.url, compiledWhitelist) !== null;
    }
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
   * @param {{ domains: Map<string, string>, urlsByOrigin: Map<string, Array> }|null} [compiledWhitelist=null]
   * @returns {{ eligible: boolean, reason: string }}
   */
  function isTabEligible(
    tab,
    settings,
    lastActiveMs,
    nowMs,
    forceAll = false,
    isExempt = false,
    hasUnsavedForm = false,
    compiledWhitelist = null
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

    if (compiledWhitelist) {
      const wlHit = matchCompiledWhitelist(tab.url, compiledWhitelist);
      if (wlHit === 'domain') return { eligible: false, reason: 'domain_whitelisted' };
      if (wlHit === 'url') return { eligible: false, reason: 'url_whitelisted' };
    } else {
      if (isDomainWhitelisted(tab.url, settings.whitelist)) {
        return { eligible: false, reason: 'domain_whitelisted' };
      }
      if (isUrlWhitelisted(tab.url, settings.whitelistUrls)) {
        return { eligible: false, reason: 'url_whitelisted' };
      }
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

  /**
   * Computes the adaptive delay (in ms) until the next alarm check should run.
   * Returns null when automatic suspension is disabled so the alarm can be cleared
   * and the Service Worker can sleep with zero periodic wakeups.
   *
   * @param {object[]} tabs - Current non-discarded tabs
   * @param {object} settings - Extension settings
   * @param {Record<string, number>} activityData - Session map containing `tab_${id}` timestamps
   * @param {Record<string, boolean>} exemptData - Session map containing `exempt_tab_${id}` flags
   * @param {number} nowMs - Current timestamp (ms)
   * @param {Map<number, number>|null} [dirtyFormMap=null] - Map of tabId -> cooldown expiration ms
   * @param {{ domains: Map<string, string>, urlsByOrigin: Map<string, Array> }|null} [compiledWhitelist=null]
   * @param {number} [minDelayMs=MIN_ALARM_DELAY_MS]
   * @returns {number|null}
   */
  function computeNextCheckDelayMs(
    tabs,
    settings,
    activityData,
    exemptData,
    nowMs,
    dirtyFormMap = null,
    compiledWhitelist = null,
    minDelayMs = MIN_ALARM_DELAY_MS
  ) {
    if (!settings || !settings.enabled) return null;

    const effectiveThreshold = settings.aggressiveMode
      ? Math.min(settings.thresholdMinutes, 5)
      : settings.thresholdMinutes;
    const rawThresholdMs = effectiveThreshold * 60 * 1000;
    const maxDelayMs = Math.max(minDelayMs, rawThresholdMs);

    let earliestDelayMs = maxDelayMs;

    if (Array.isArray(tabs)) {
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (!tab || tab.active || tab.discarded) continue;

        const isExempt = Boolean(exemptData && exemptData[`exempt_tab_${tab.id}`]);
        if (isTabImmune(tab, settings, isExempt, compiledWhitelist)) continue;

        const dirtyUntil = dirtyFormMap ? dirtyFormMap.get(tab.id) : undefined;
        if (dirtyUntil !== undefined && dirtyUntil > nowMs) {
          const dirtyRemaining = dirtyUntil - nowMs;
          if (dirtyRemaining < earliestDelayMs) {
            earliestDelayMs = dirtyRemaining;
          }
          continue;
        }

        const lastActive = activityData ? activityData[`tab_${tab.id}`] : undefined;
        const remainingMs = lastActive === undefined
          ? rawThresholdMs
          : (lastActive + rawThresholdMs) - nowMs;

        if (remainingMs < earliestDelayMs) {
          earliestDelayMs = remainingMs;
        }
      }
    }

    return Math.max(minDelayMs, Math.min(maxDelayMs, earliestDelayMs));
  }

  const RamSaverUtils = Object.freeze({
    ALARM_NAME,
    RAM_PER_TAB_MB,
    MIN_ALARM_DELAY_MS,
    DIRTY_FORM_COOLDOWN_MS,
    SYSTEM_URL_PREFIXES,
    DEFAULT_SETTINGS,
    normalizeUrl,
    normalizeDomain,
    extractHostname,
    isValidDomain,
    isValidUrl,
    isSystemUrl,
    isTabInGroup,
    compileWhitelist,
    findMatchingDomain,
    isDomainWhitelisted,
    findMatchingUrl,
    isUrlWhitelisted,
    isTabImmune,
    isTabEligible,
    computeNextCheckDelayMs
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RamSaverUtils;
  }
  if (root) {
    root.RamSaverUtils = RamSaverUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
