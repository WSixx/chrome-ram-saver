// =============================================================================
// tests/unit/manifest.test.js
// Unit tests validating manifest.json structure, permissions, and asset paths.
// =============================================================================

const fs = require('fs');
const path = require('path');
const manifest = require('../../manifest.json');

const ROOT_DIR = path.resolve(__dirname, '../..');

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

  test('defines a service worker background that exists on disk', () => {
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe('background/service-worker.js');
    expect(fs.existsSync(path.join(ROOT_DIR, manifest.background.service_worker))).toBe(true);
  });

  test('defines a default popup that exists on disk', () => {
    expect(manifest.action.default_popup).toBe('popup/popup.html');
    expect(fs.existsSync(path.join(ROOT_DIR, manifest.action.default_popup))).toBe(true);
  });

  test('defines an options page that exists on disk', () => {
    expect(manifest.options_ui.page).toBe('options/options.html');
    expect(fs.existsSync(path.join(ROOT_DIR, manifest.options_ui.page))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Required permissions
// ---------------------------------------------------------------------------
describe('manifest.json — required permissions', () => {
  test.each(['tabs', 'storage', 'alarms', 'scripting', 'tabGroups', 'contextMenus'])(
    'has %s permission',
    (perm) => {
      expect(manifest.permissions).toContain(perm);
    }
  );

  test('does NOT declare invalid MV3 "windows" permission', () => {
    expect(manifest.permissions).not.toContain('windows');
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

  test('suspended icons are declared as web-accessible and exist on disk', () => {
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
    expect(resources).toContain('icons/suspended16.png');
    expect(resources).toContain('icons/suspended32.png');
    for (const res of resources) {
      expect(fs.existsSync(path.join(ROOT_DIR, res))).toBe(true);
    }
  });

  test('web-accessible resources match all URLs', () => {
    const matchesAll = manifest.web_accessible_resources
      .some((entry) => entry.matches.includes('<all_urls>'));
    expect(matchesAll).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
describe('manifest.json — icons', () => {
  test('declares icons at 16, 48, 128 sizes and all files exist on disk', () => {
    for (const size of ['16', '48', '128']) {
      expect(manifest.icons[size]).toBeDefined();
      expect(fs.existsSync(path.join(ROOT_DIR, manifest.icons[size]))).toBe(true);
    }
  });

  test('action declares default icons and all files exist on disk', () => {
    for (const size of ['16', '48', '128']) {
      expect(manifest.action.default_icon[size]).toBeDefined();
      expect(fs.existsSync(path.join(ROOT_DIR, manifest.action.default_icon[size]))).toBe(true);
    }
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
