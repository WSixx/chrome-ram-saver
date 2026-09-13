// =============================================================================
// tests/unit/extract-changelog.test.js
// Tests the changelog extraction helper for GitHub Releases
// =============================================================================

const { getChangelogNotes } = require('../../scripts/extract-changelog');

describe('extract-changelog script', () => {
  test('extracts 1.9.0 notes including markdown bullets', () => {
    const notes = getChangelogNotes('1.9.0');
    expect(notes).toContain('Window Tabs Manager in popup');
    expect(notes).toContain('Zero-telemetry guarantee');
    expect(notes).not.toContain('## [1.9.0]');
    expect(notes).not.toContain('## [1.8.0]');
  });

  test('extracts notes when version has "v" prefix', () => {
    const notes = getChangelogNotes('v1.8.0');
    expect(notes).toContain('Context menu (right-click) integration');
    expect(notes).toContain('Alt + Shift + S');
    expect(notes).not.toContain('## [1.8.0]');
  });

  test('returns empty string for non-existent version', () => {
    const notes = getChangelogNotes('99.99.99');
    expect(notes).toBe('');
  });
});
