// =============================================================================
// tests/unit/tab-utils.test.js
// Unit tests for URL utility functions used in the service worker.
// =============================================================================

const {
  normalizeUrl,
  isDomainWhitelisted,
  isUrlWhitelisted,
  isSystemUrl,
} = require('../helpers/utils');

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

  test('handles root path', () => {
    expect(normalizeUrl('https://example.com/'))
      .toBe('https://example.com/');
  });

  test('returns input unchanged for invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

// ---------------------------------------------------------------------------
// isDomainWhitelisted
// ---------------------------------------------------------------------------
describe('isDomainWhitelisted()', () => {
  const whitelist = ['github.com', 'google.com'];

  test('matches exact domain', () => {
    expect(isDomainWhitelisted('https://github.com/user/repo', whitelist)).toBe(true);
  });

  test('matches subdomain', () => {
    expect(isDomainWhitelisted('https://docs.github.com/en', whitelist)).toBe(true);
    expect(isDomainWhitelisted('https://mail.google.com', whitelist)).toBe(true);
  });

  test('strips www from whitelisted domain', () => {
    const wl = ['www.github.com'];
    expect(isDomainWhitelisted('https://github.com/page', wl)).toBe(true);
  });

  test('strips www from tab URL', () => {
    expect(isDomainWhitelisted('https://www.github.com/page', whitelist)).toBe(true);
  });

  test('does not match different domain', () => {
    expect(isDomainWhitelisted('https://evil.com', whitelist)).toBe(false);
  });

  test('does not partially match domain suffix', () => {
    // 'notgithub.com' should NOT match 'github.com'
    expect(isDomainWhitelisted('https://notgithub.com', whitelist)).toBe(false);
  });

  test('returns false for empty whitelist', () => {
    expect(isDomainWhitelisted('https://github.com', [])).toBe(false);
  });

  test('returns false for null whitelist', () => {
    expect(isDomainWhitelisted('https://github.com', null)).toBe(false);
  });

  test('returns false for invalid URL', () => {
    expect(isDomainWhitelisted('not-a-url', whitelist)).toBe(false);
  });

  test('returns false for empty URL', () => {
    expect(isDomainWhitelisted('', whitelist)).toBe(false);
  });

  test('is case-insensitive', () => {
    const wl = ['GitHub.COM'];
    expect(isDomainWhitelisted('https://github.com', wl)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isUrlWhitelisted
// ---------------------------------------------------------------------------
describe('isUrlWhitelisted()', () => {
  const whitelistUrls = [
    'https://app.example.com/dashboard',
    'https://tool.example.com/editor',
  ];

  test('matches exact normalized URL', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard', whitelistUrls)).toBe(true);
  });

  test('matches URL with query params (normalized)', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard?tab=1', whitelistUrls)).toBe(true);
  });

  test('matches URL with hash (normalized)', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard#section', whitelistUrls)).toBe(true);
  });

  test('matches URL that starts with whitelisted prefix', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard/sub', whitelistUrls)).toBe(true);
  });

  test('does not match different path', () => {
    expect(isUrlWhitelisted('https://app.example.com/settings', whitelistUrls)).toBe(false);
  });

  test('does not match different host', () => {
    expect(isUrlWhitelisted('https://other.example.com/dashboard', whitelistUrls)).toBe(false);
  });

  test('returns false for empty list', () => {
    expect(isUrlWhitelisted('https://app.example.com/dashboard', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSystemUrl
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

  test('returns true for null URL', () => {
    expect(isSystemUrl(null)).toBe(true);
  });

  test('returns true for empty string', () => {
    expect(isSystemUrl('')).toBe(true);
  });
});
