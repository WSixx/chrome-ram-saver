// =============================================================================
// tests/unit/manifest.test.js
// Unit tests validating the manifest.json structure and required permissions.
// =============================================================================

const manifest = require('../../manifest.json');

// ---------------------------------------------------------------------------
// Basic manifest structure
// ---------------------------------------------------------------------------
describe('manifest.json — basic structure', () => {
  test('uses manifest_version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  test('has a valid version string', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('defines a service worker background', () => {
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe('background/service-worker.js');
  });

  test('defines a default popup', () => {
    expect(manifest.action.default_popup).toBe('popup/popup.html');
  });

  test('defines an options page', () => {
    expect(manifest.options_ui.page).toBe('options/options.html');
  });
});

// ---------------------------------------------------------------------------
// Required permissions
// ---------------------------------------------------------------------------
describe('manifest.json — required permissions', () => {
  test('has tabs permission', () => {
    expect(manifest.permissions).toContain('tabs');
  });

  test('has storage permission', () => {
    expect(manifest.permissions).toContain('storage');
  });

  test('has alarms permission', () => {
    expect(manifest.permissions).toContain('alarms');
  });

  test('has scripting permission', () => {
    expect(manifest.permissions).toContain('scripting');
  });

  test('has tabGroups permission', () => {
    expect(manifest.permissions).toContain('tabGroups');
  });

  test('has contextMenus permission', () => {
    expect(manifest.permissions).toContain('contextMenus');
  });

  test('has host_permissions with <all_urls> (required for chrome.scripting.executeScript)', () => {
    expect(manifest.host_permissions).toBeDefined();
    expect(manifest.host_permissions).toContain('<all_urls>');
  });
});

// ---------------------------------------------------------------------------
// Web-accessible resources (for suspended favicon)
// ---------------------------------------------------------------------------
describe('manifest.json — web accessible resources', () => {
  test('declares web_accessible_resources', () => {
    expect(manifest.web_accessible_resources).toBeDefined();
    expect(Array.isArray(manifest.web_accessible_resources)).toBe(true);
    expect(manifest.web_accessible_resources.length).toBeGreaterThan(0);
  });

  test('suspended icons are declared as web-accessible', () => {
    const resources = manifest.web_accessible_resources
      .flatMap(entry => entry.resources);
    expect(resources).toContain('icons/suspended16.png');
    expect(resources).toContain('icons/suspended32.png');
  });

  test('web-accessible resources match all URLs', () => {
    const matchesAll = manifest.web_accessible_resources
      .some(entry => entry.matches.includes('<all_urls>'));
    expect(matchesAll).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
describe('manifest.json — icons', () => {
  test('declares icons at 16, 48, 128 sizes', () => {
    expect(manifest.icons['16']).toBeDefined();
    expect(manifest.icons['48']).toBeDefined();
    expect(manifest.icons['128']).toBeDefined();
  });

  test('action declares default icons', () => {
    expect(manifest.action.default_icon['16']).toBeDefined();
    expect(manifest.action.default_icon['48']).toBeDefined();
    expect(manifest.action.default_icon['128']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Commands / Keyboard shortcuts
// ---------------------------------------------------------------------------
describe('manifest.json — commands', () => {
  test('declares commands object', () => {
    expect(manifest.commands).toBeDefined();
  });

  test('has suspend-current-tab command with Alt+Shift+S', () => {
    const cmd = manifest.commands['suspend-current-tab'];
    expect(cmd).toBeDefined();
    expect(cmd.suggested_key.default).toBe('Alt+Shift+S');
  });

  test('has suspend-other-tabs command with Alt+Shift+O', () => {
    const cmd = manifest.commands['suspend-other-tabs'];
    expect(cmd).toBeDefined();
    expect(cmd.suggested_key.default).toBe('Alt+Shift+O');
  });
});

