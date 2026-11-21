// =============================================================================
// tests/unit/validation.test.js
// Unit tests for user input validation in utils/shared.js
// =============================================================================

const { isValidDomain, normalizeDomain, isValidUrl, normalizeUrl } = require('../../utils/shared');

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
    ['app.s3.amazonaws.com', true],
    ['a.b.com', true],
    ['api-2.v1.example.io', true],
  ])('valid domain "%s" → true', (domain, expected) => {
    expect(isValidDomain(domain)).toBe(expected);
  });

  test.each([
    ['github', false],            // no TLD
    ['just-text', false],
    ['', false],
    ['ftp://github.com', false],  // unsupported protocol
    ['.github.com', false],       // leading dot
    ['github..com', false],       // double dot
    ['github.c', false],          // TLD too short
    ['-github.com', false],       // leading hyphen
    ['github-.com', false],       // trailing hyphen
  ])('invalid domain "%s" → false', (domain, expected) => {
    expect(isValidDomain(domain)).toBe(expected);
  });

  test('strips https:// and www. prefixes before validating', () => {
    expect(isValidDomain('https://github.com')).toBe(true);
    expect(isValidDomain('www.github.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeDomain
// ---------------------------------------------------------------------------
describe('normalizeDomain()', () => {
  test('strips https:// and http:// prefixes', () => {
    expect(normalizeDomain('https://github.com')).toBe('github.com');
    expect(normalizeDomain('http://example.com')).toBe('example.com');
  });

  test('strips www. prefix', () => {
    expect(normalizeDomain('www.github.com')).toBe('github.com');
    expect(normalizeDomain('https://www.github.com')).toBe('github.com');
  });

  test('strips path and port after domain', () => {
    expect(normalizeDomain('github.com/user/repo')).toBe('github.com');
    expect(normalizeDomain('example.com:8080/app')).toBe('example.com');
  });

  test('lowercases and trims whitespace', () => {
    expect(normalizeDomain('  GitHub.COM  ')).toBe('github.com');
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
// normalizeUrl (unified across SW, popup, and options)
// ---------------------------------------------------------------------------
describe('normalizeUrl() — unified normalizer', () => {
  test('removes trailing slash from root and subpaths', () => {
    expect(normalizeUrl('https://app.example.com/')).toBe('https://app.example.com');
    expect(normalizeUrl('https://app.example.com/dashboard/')).toBe('https://app.example.com/dashboard');
  });

  test('preserves sub-paths', () => {
    expect(normalizeUrl('https://app.example.com/dashboard/settings'))
      .toBe('https://app.example.com/dashboard/settings');
  });

  test('strips query params and hash', () => {
    expect(normalizeUrl('https://app.example.com/page?debug=true#top'))
      .toBe('https://app.example.com/page');
  });
});
