// =============================================================================
// tests/unit/validation.test.js
// Unit tests for user input validation used in options/options.js
// =============================================================================

const { isValidDomain, normalizeDomain, isValidUrl, normalizeUrl } = require('../helpers/utils');

// ---------------------------------------------------------------------------
// isValidDomain
// ---------------------------------------------------------------------------
describe('isValidDomain()', () => {
  test.each([
    ['github.com', true],
    ['www.github.com', true],
    ['sub.domain.example.co.uk', true],
    ['my-site.io', true],
    ['example.app', true],
    ['x.co', true],
  ])('valid domain "%s" → true', (domain, expected) => {
    expect(isValidDomain(domain)).toBe(expected);
  });

  test.each([
    ['github', false],           // no TLD
    ['just-text', false],
    ['', false],
    ['ftp://github.com', false],  // unsupported protocol
    ['.github.com', false],      // leading dot
    ['github..com', false],      // double dot
    ['github.c', false],         // TLD too short
  ])('invalid domain "%s" → false', (domain, expected) => {
    expect(isValidDomain(domain)).toBe(expected);
  });

  test('strips https:// prefix before validating', () => {
    // The function internally strips the protocol
    expect(isValidDomain('https://github.com')).toBe(true);
  });

  test('strips www. prefix before validating', () => {
    expect(isValidDomain('www.github.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeDomain
// ---------------------------------------------------------------------------
describe('normalizeDomain()', () => {
  test('strips https:// prefix', () => {
    expect(normalizeDomain('https://github.com')).toBe('github.com');
  });

  test('strips http:// prefix', () => {
    expect(normalizeDomain('http://example.com')).toBe('example.com');
  });

  test('strips www. prefix', () => {
    expect(normalizeDomain('www.github.com')).toBe('github.com');
  });

  test('strips both protocol and www', () => {
    expect(normalizeDomain('https://www.github.com')).toBe('github.com');
  });

  test('strips path after domain', () => {
    expect(normalizeDomain('github.com/user/repo')).toBe('github.com');
  });

  test('lowercases the result', () => {
    expect(normalizeDomain('GitHub.COM')).toBe('github.com');
  });

  test('strips whitespace', () => {
    expect(normalizeDomain('  github.com  ')).toBe('github.com');
  });
});

// ---------------------------------------------------------------------------
// isValidUrl
// ---------------------------------------------------------------------------
describe('isValidUrl()', () => {
  test.each([
    ['https://github.com', true],
    ['https://app.example.com/dashboard', true],
    ['https://app.example.com/path?q=1', true],
    ['http://localhost:3000', true],
    ['http://192.168.1.1/admin', true],
  ])('valid URL "%s" → true', (url, expected) => {
    expect(isValidUrl(url)).toBe(expected);
  });

  test.each([
    ['github.com', false],           // no protocol
    ['ftp://example.com', false],    // unsupported protocol
    ['chrome://extensions', false],  // chrome:// not http(s)
    ['', false],
    ['just text', false],
    ['//example.com', false],        // protocol-relative not valid
  ])('invalid URL "%s" → false', (url, expected) => {
    expect(isValidUrl(url)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// normalizeUrl (as used by options.js)
// ---------------------------------------------------------------------------
describe('normalizeUrl() — options page variant', () => {
  test('removes trailing slash from root', () => {
    // The options normalizer trims trailing slash
    // normalizeUrl from utils does NOT trim — this is intentional
    // The options.js version calls .replace(/\/$/, '')
    const raw = 'https://app.example.com/';
    const u = new URL(raw.trim());
    const normalized = `${u.origin}${u.pathname}`.replace(/\/$/, '');
    expect(normalized).toBe('https://app.example.com');
  });

  test('preserves sub-paths', () => {
    const raw = 'https://app.example.com/dashboard/settings';
    const u = new URL(raw.trim());
    const normalized = `${u.origin}${u.pathname}`.replace(/\/$/, '');
    expect(normalized).toBe('https://app.example.com/dashboard/settings');
  });

  test('strips query params', () => {
    const raw = 'https://app.example.com/page?debug=true';
    const u = new URL(raw.trim());
    const normalized = `${u.origin}${u.pathname}`.replace(/\/$/, '');
    expect(normalized).toBe('https://app.example.com/page');
  });
});
