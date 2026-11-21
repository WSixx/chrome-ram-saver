// =============================================================================
// tests/unit/tab-utils.test.js
// Unit tests for URL utility functions in utils/shared.js
// =============================================================================

const {
  normalizeUrl,
  extractHostname,
  compileWhitelist,
  findMatchingDomain,
  isDomainWhitelisted,
  findMatchingUrl,
  isUrlWhitelisted,
  isSystemUrl,
  isTabInGroup,
} = require('../../utils/shared');

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------
describe('normalizeUrl()', () => {
  test('strips query string', () => {
    expect(normalizeUrl('https://example.com/page?foo=bar'))
      .toBe('https://example.com/page');
  });

  test('strips hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section'))
      .toBe('https://example.com/page');
  });

  test('strips both query and hash', () => {
    expect(normalizeUrl('https://example.com/path?q=1#top'))
      .toBe('https://example.com/path');
  });

  test('preserves path without query/hash', () => {
    expect(normalizeUrl('https://example.com/a/b/c'))
      .toBe('https://example.com/a/b/c');
  });

  test('strips trailing slash consistently (root and subpaths)', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    expect(normalizeUrl('https://example.com/dashboard/')).toBe('https://example.com/dashboard');
  });

  test('returns trimmed input for invalid URLs', () => {
    expect(normalizeUrl('  not-a-url  ')).toBe('not-a-url');
  });
});

// ---------------------------------------------------------------------------
// isDomainWhitelisted & findMatchingDomain
// ---------------------------------------------------------------------------
describe('isDomainWhitelisted() & findMatchingDomain()', () => {
  const whitelist = ['github.com', 'google.com'];

  test('matches exact domain', () => {
    expect(isDomainWhitelisted('https://github.com/user/repo', whitelist)).toBe(true);
    expect(findMatchingDomain('https://github.com/user/repo', whitelist)).toBe('github.com');
  });

  test('matches subdomain and returns the matched whitelist entry', () => {
    expect(isDomainWhitelisted('https://docs.github.com/en', whitelist)).toBe(true);
    expect(findMatchingDomain('https://docs.github.com/en', whitelist)).toBe('github.com');
    expect(isDomainWhitelisted('https://mail.google.com', whitelist)).toBe(true);
  });

  test('strips www from whitelisted domain', () => {
    const wl = ['www.github.com'];
    expect(isDomainWhitelisted('https://github.com/page', wl)).toBe(true);
    expect(findMatchingDomain('https://github.com/page', wl)).toBe('www.github.com');
  });

  test('strips www from tab URL', () => {
    expect(isDomainWhitelisted('https://www.github.com/page', whitelist)).toBe(true);
  });

  test('does not match different domain', () => {
    expect(isDomainWhitelisted('https://evil.com', whitelist)).toBe(false);
    expect(findMatchingDomain('https://evil.com', whitelist)).toBeNull();
  });

  test('does not partially match domain suffix', () => {
    expect(isDomainWhitelisted('https://notgithub.com', whitelist)).toBe(false);
  });

  test('ignores empty strings in whitelist and URLs without hostname (file://)', () => {
    expect(isDomainWhitelisted('file:///C:/index.html', [''])).toBe(false);
    expect(isDomainWhitelisted('https://github.com', [''])).toBe(false);
  });

  test('returns false for empty or null whitelist', () => {
    expect(isDomainWhitelisted('https://github.com', [])).toBe(false);
    expect(isDomainWhitelisted('https://github.com', null)).toBe(false);
  });

  test('returns false for invalid or empty URL', () => {
    expect(isDomainWhitelisted('not-a-url', whitelist)).toBe(false);
    expect(isDomainWhitelisted('', whitelist)).toBe(false);
  });

  test('is case-insensitive', () => {
    const wl = ['GitHub.COM'];
    expect(isDomainWhitelisted('https://github.com', wl)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isUrlWhitelisted & findMatchingUrl
// ---------------------------------------------------------------------------
describe('isUrlWhitelisted() & findMatchingUrl()', () => {
  const whitelistUrls = [
    'https://app.example.com/dashboard',
    'https://tool.example.com/editor',
  ];

  test('matches exact normalized URL', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard', whitelistUrls)).toBe(true);
    expect(findMatchingUrl('https://app.example.com/dashboard', whitelistUrls))
      .toBe('https://app.example.com/dashboard');
  });

  test('matches URL with trailing slash or query/hash', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard/', whitelistUrls)).toBe(true);
    expect(isUrlWhitelisted('https://app.example.com/dashboard?tab=1', whitelistUrls)).toBe(true);
    expect(isUrlWhitelisted('https://app.example.com/dashboard#section', whitelistUrls)).toBe(true);
  });

  test('matches sub-path at segment boundary', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard/sub', whitelistUrls)).toBe(true);
  });

  test('does NOT false-positive on sibling path prefix (/dashboard vs /dashboard-v2)', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard-v2', whitelistUrls)).toBe(false);
    expect(isUrlWhitelisted('https://app.example.com/apple', ['https://app.example.com/app'])).toBe(false);
  });

  test('does NOT false-positive on domain spoofing (https://a.com vs https://a.com.evil.com)', () => {
    expect(isUrlWhitelisted('https://app.example.com.evil.com/dashboard', ['https://app.example.com'])).toBe(false);
  });

  test('does not match different path or host', () => {
    expect(isUrlWhitelisted('https://app.example.com/settings', whitelistUrls)).toBe(false);
    expect(isUrlWhitelisted('https://other.example.com/dashboard', whitelistUrls)).toBe(false);
  });

  test('returns false for empty list', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSystemUrl & isTabInGroup
// ---------------------------------------------------------------------------
describe('isSystemUrl()', () => {
  test.each([
    ['chrome://extensions', true],
    ['chrome://newtab', true],
    ['chrome-extension://abcdef/popup.html', true],
    ['about:blank', true],
    ['about:newtab', true],
    ['devtools://devtools/bundled', true],
    ['view-source:https://example.com', true],
    ['edge://settings', true],
  ])('returns true for system URL: %s', (url, expected) => {
    expect(isSystemUrl(url)).toBe(expected);
  });

  test.each([
    ['https://example.com', false],
    ['http://localhost:3000', false],
    ['https://github.com/user/repo', false],
  ])('returns false for regular URL: %s', (url, expected) => {
    expect(isSystemUrl(url)).toBe(expected);
  });

  test('returns true for null or empty URL', () => {
    expect(isSystemUrl(null)).toBe(true);
    expect(isSystemUrl('')).toBe(true);
  });
});

describe('isTabInGroup()', () => {
  test('returns true when groupId > -1', () => {
    expect(isTabInGroup({ groupId: 0 })).toBe(true);
    expect(isTabInGroup({ groupId: 42 })).toBe(true);
  });

  test('returns false when groupId is -1 or missing', () => {
    expect(isTabInGroup({ groupId: -1 })).toBe(false);
    expect(isTabInGroup({})).toBe(false);
    expect(isTabInGroup(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractHostname()
// ---------------------------------------------------------------------------
describe('extractHostname()', () => {
  test('extracts lowercase hostname without www. prefix or port', () => {
    expect(extractHostname('https://www.GitHub.com:443/user/repo')).toBe('github.com');
    expect(extractHostname('http://docs.example.com:8080/page')).toBe('docs.example.com');
  });

  test('returns empty string for invalid, empty, or hostless URLs', () => {
    expect(extractHostname('file:///C:/index.html')).toBe('');
    expect(extractHostname('not-a-url')).toBe('');
    expect(extractHostname('')).toBe('');
    expect(extractHostname(null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// compileWhitelist() — O(1) compiled matcher parity
// ---------------------------------------------------------------------------
describe('compileWhitelist()', () => {
  const domains = ['GitHub.COM', 'www.google.com', '', null];
  const urls = [
    'https://app.example.com/dashboard/',
    'https://tool.example.com/app',
    'https://exact.example.com',
    '',
    null,
  ];
  const compiled = compileWhitelist(domains, urls);

  test('matches exact domains, subdomains, and www with compiled matcher', () => {
    expect(findMatchingDomain('https://github.com/org/repo', compiled)).toBe('GitHub.COM');
    expect(findMatchingDomain('https://api.docs.github.com', compiled)).toBe('GitHub.COM');
    expect(findMatchingDomain('https://www.google.com/search', compiled)).toBe('www.google.com');
    expect(isDomainWhitelisted('https://mail.google.com', compiled)).toBe(true);
  });

  test('rejects partial suffixes, non-matching domains, and invalid URLs', () => {
    expect(isDomainWhitelisted('https://notgithub.com', compiled)).toBe(false);
    expect(isDomainWhitelisted('https://evil.com', compiled)).toBe(false);
    expect(isDomainWhitelisted('file:///C:/test.html', compiled)).toBe(false);
    expect(isDomainWhitelisted('not-a-url', compiled)).toBe(false);
  });

  test('matches normalized URLs and subpaths at path boundaries only', () => {
    expect(findMatchingUrl('https://app.example.com/dashboard?tab=1#top', compiled))
      .toBe('https://app.example.com/dashboard/');
    expect(isUrlWhitelisted('https://app.example.com/dashboard/settings', compiled)).toBe(true);
    expect(isUrlWhitelisted('https://exact.example.com/any/path', compiled)).toBe(true);

    // Must not false-positive on sibling path prefixes or spoofed hosts
    expect(isUrlWhitelisted('https://app.example.com/dashboard-v2', compiled)).toBe(false);
    expect(isUrlWhitelisted('https://tool.example.com/apple', compiled)).toBe(false);
    expect(isUrlWhitelisted('https://exact.example.com.evil.com/path', compiled)).toBe(false);
  });

  test('handles empty compiled whitelist cleanly', () => {
    const empty = compileWhitelist([], []);
    expect(isDomainWhitelisted('https://github.com', empty)).toBe(false);
    expect(isUrlWhitelisted('https://github.com/page', empty)).toBe(false);
  });
});
