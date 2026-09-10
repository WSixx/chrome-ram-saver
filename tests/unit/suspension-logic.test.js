// =============================================================================
// tests/unit/suspension-logic.test.js
// Unit tests for the core tab suspension eligibility logic.
// =============================================================================

const { isTabEligible } = require('../helpers/utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = Date.now();
const MINS = m => m * 60 * 1000;

/** Creates a minimal tab object with sensible defaults */
function makeTab(overrides = {}) {
  return {
    id: 1,
    url: 'https://example.com',
    active: false,
    discarded: false,
    pinned: false,
    audible: false,
    ...overrides,
  };
}

/** Creates a minimal settings object with sensible defaults */
function makeSettings(overrides = {}) {
  return {
    enabled: true,
    thresholdMinutes: 30,
    whitelist: [],
    whitelistUrls: [],
    noSuspendAudio: true,
    noSuspendPinned: true,
    aggressiveMode: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ineligible — tab state
// ---------------------------------------------------------------------------
describe('isTabEligible() — tab state exclusions', () => {
  const settings = makeSettings();
  const inactiveAgo = NOW - MINS(60); // inactive 60 min ago

  test('active tab is not eligible', () => {
    const tab = makeTab({ active: true });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('active');
  });

  test('already discarded tab is not eligible', () => {
    const tab = makeTab({ discarded: true });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('already_discarded');
  });

  test('pinned tab is not eligible when noSuspendPinned=true', () => {
    const tab = makeTab({ pinned: true });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('pinned');
  });

  test('pinned tab IS eligible when noSuspendPinned=false', () => {
    const tab = makeTab({ pinned: true });
    const s = makeSettings({ noSuspendPinned: false });
    const result = isTabEligible(tab, s, inactiveAgo, NOW);
    expect(result.eligible).toBe(true);
  });

  test('audible tab is not eligible when noSuspendAudio=true', () => {
    const tab = makeTab({ audible: true });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('audible');
  });

  test('audible tab IS eligible when noSuspendAudio=false', () => {
    const tab = makeTab({ audible: true });
    const s = makeSettings({ noSuspendAudio: false });
    const result = isTabEligible(tab, s, inactiveAgo, NOW);
    expect(result.eligible).toBe(true);
  });

  test('tab with no URL is not eligible', () => {
    const tab = makeTab({ url: '' });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_url');
  });

  test('tab with about:blank is not eligible', () => {
    const tab = makeTab({ url: 'about:blank' });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_url');
  });
});

// ---------------------------------------------------------------------------
// Ineligible — system URLs
// ---------------------------------------------------------------------------
describe('isTabEligible() — system URL exclusions', () => {
  const settings = makeSettings();
  const inactiveAgo = NOW - MINS(60);

  test.each([
    'chrome://extensions',
    'chrome://newtab',
    'chrome-extension://abc/popup.html',
    'about:blank',
    'devtools://devtools/bundled',
    'view-source:https://example.com',
  ])('system URL "%s" is not eligible', (url) => {
    const tab = makeTab({ url });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('system_url');
  });
});

// ---------------------------------------------------------------------------
// Ineligible — whitelist
// ---------------------------------------------------------------------------
describe('isTabEligible() — whitelist exclusions', () => {
  const inactiveAgo = NOW - MINS(60);

  test('tab matching whitelisted domain is not eligible', () => {
    const tab = makeTab({ url: 'https://github.com/user/repo' });
    const settings = makeSettings({ whitelist: ['github.com'] });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('domain_whitelisted');
  });

  test('tab matching subdomain of whitelisted domain is not eligible', () => {
    const tab = makeTab({ url: 'https://docs.github.com' });
    const settings = makeSettings({ whitelist: ['github.com'] });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('domain_whitelisted');
  });

  test('tab matching whitelisted URL is not eligible', () => {
    const tab = makeTab({ url: 'https://app.example.com/dashboard' });
    const settings = makeSettings({ whitelistUrls: ['https://app.example.com/dashboard'] });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('url_whitelisted');
  });

  test('tab NOT matching any whitelist IS eligible (after threshold)', () => {
    const tab = makeTab({ url: 'https://news.ycombinator.com' });
    const settings = makeSettings({ whitelist: ['github.com'], whitelistUrls: [] });
    const result = isTabEligible(tab, settings, inactiveAgo, NOW);
    expect(result.eligible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inactivity threshold
// ---------------------------------------------------------------------------
describe('isTabEligible() — inactivity threshold', () => {
  const settings = makeSettings({ thresholdMinutes: 30 });

  test('tab inactive for less than threshold is NOT eligible', () => {
    const lastActive = NOW - MINS(15); // only 15 min inactive, threshold is 30
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_yet_inactive');
  });

  test('tab inactive for exactly threshold IS eligible', () => {
    const lastActive = NOW - MINS(30);
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(true);
  });

  test('tab inactive for more than threshold IS eligible', () => {
    const lastActive = NOW - MINS(90);
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(true);
  });

  test('forceAll=true bypasses threshold check', () => {
    const lastActive = NOW - MINS(1); // only 1 min inactive
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW, true);
    expect(result.eligible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggressive mode
// ---------------------------------------------------------------------------
describe('isTabEligible() — aggressiveMode', () => {
  test('aggressive mode caps threshold at 5 min', () => {
    const settings = makeSettings({ thresholdMinutes: 30, aggressiveMode: true });
    // Tab inactive for 6 minutes — would fail normal 30-min threshold but pass 5-min cap
    const lastActive = NOW - MINS(6);
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(true);
  });

  test('aggressive mode: tab inactive for 4 min is still NOT eligible (below 5 min cap)', () => {
    const settings = makeSettings({ thresholdMinutes: 30, aggressiveMode: true });
    const lastActive = NOW - MINS(4);
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(false);
  });

  test('non-aggressive mode: tab inactive for 6 min with 30-min threshold is NOT eligible', () => {
    const settings = makeSettings({ thresholdMinutes: 30, aggressiveMode: false });
    const lastActive = NOW - MINS(6);
    const tab = makeTab({ url: 'https://example.com' });
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe('isTabEligible() — happy path (eligible)', () => {
  test('standard inactive tab with no special properties is eligible', () => {
    const tab = makeTab({
      url: 'https://news.example.com/article',
      active: false,
      discarded: false,
      pinned: false,
      audible: false,
    });
    const settings = makeSettings({ thresholdMinutes: 10 });
    const lastActive = NOW - MINS(15);
    const result = isTabEligible(tab, settings, lastActive, NOW);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('ok');
  });
});
