# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Nothing yet — be the first to contribute!

---

## [1.9.1] — 2026-09-12

### Fixed
- Window Tabs Manager: waking up (`🔄`) or selecting a suspended tab now immediately forces Chrome to reload and restore the page, rather than only focusing the discarded tab

---

## [1.9.0] — 2026-09-12

### Added
- Window Tabs Manager in popup: interactive drawer showing all open tabs in the current window in real time
  - Visual status badges for every tab: 🟢 Active, 💤 Suspended, 🛡️ Immune / Whitelisted, and 🟡 Inactive
  - Instant actions: 💤 button to suspend any background tab on demand, 🔄 button to wake/restore suspended tabs
  - Click any tab row to smoothly switch focus to that tab in Chrome
  - Real-time search filter to quickly find tabs by title, domain, or URL
  - Collapsible drawer state preserved across popup sessions
- Privacy statement & zero-telemetry guarantee documented across README and extension details (100% local, no analytics, no external servers)
- Expanded popup width to 350px for enhanced legibility and action comfort
- Full trilingual support for the Tab Manager in English, Português, and Español

---

## [1.8.0] — 2026-09-12

### Added
- Context menu (right-click) integration on web pages and toolbar extension icon:
  - "Suspend this tab" — suspends the open tab (switches smoothly to adjacent tab before discarding if active)
  - "Suspend other tabs in this window" — suspends all eligible background tabs in the current window
  - "Never suspend this site" — instantly adds the current domain to the whitelist
- Configurable global keyboard shortcuts:
  - `Alt + Shift + S`: Suspend current tab
  - `Alt + Shift + O`: Suspend other tabs in this window
- Keyboard shortcuts section in the Settings page with a quick button to open `chrome://extensions/shortcuts`
- Added `"contextMenus"` permission and `"commands"` declaration in `manifest.json`
- Trilingual localization for all new context menu items and command descriptions (English, Português, Español)
- Unit tests for `contextMenus` permission and `commands` structure in `manifest.test.js`

---

## [1.7.0] — 2026-09-12

### Added
- Suspended favicon indicator: replaces the tab's favicon with a gray "Z" icon when a tab is discarded, providing a clear visual cue in Chrome's tab bar
- Static suspended icons (`icons/suspended16.png`, `icons/suspended32.png`) as web-accessible extension resources
- `web_accessible_resources` in manifest to allow favicon injection across all pages (bypasses CSP)
- `host_permissions: ["<all_urls>"]` in manifest — **required** for `chrome.scripting.executeScript` to function on any web page
- Favicon change waits for Chrome acknowledgment (`chrome.tabs.onUpdated` with `favIconUrl`) before discarding, ensuring the icon persists
- Uses `world: 'MAIN'` for script injection so Chrome's internal favicon observer detects the DOM change
- Unit tests for manifest.json structure validation (permissions, web-accessible resources, icons)

### Fixed
- **Critical**: All `chrome.scripting.executeScript` calls (💤 title indicator, form data protection, favicon change) were silently failing because `host_permissions` was missing from the manifest. Added `host_permissions: ["<all_urls>"]` to fix

---

## [1.6.0] — 2026-09-10

### Added
- Visual suspended tab indicator: automatically prepends 💤 to the tab title in Chrome's tab bar when discarded, restoring cleanly upon activation
- Settings toggle to enable/disable the 💤 tab title indicator (`markSuspendedTitle`, enabled by default)
- Translations in English, Português (Brasil), and Español for the title indicator setting

---

## [1.5.0] — 2026-09-10

### Added
- Automated CI workflow with GitHub Actions (`.github/workflows/ci.yml`) running unit tests on all PRs and pushes to `main`

---

## [1.4.0] — 2026-09-10

### Added
- Chrome Tab Groups integration: detect grouped tabs and optionally protect entire tab groups from suspension
- Settings toggle to enable/disable tab group protection (`noSuspendGrouped`, default: off)
- Added `tabGroups` permission in `manifest.json`
- Translations in English, Português (Brasil), and Español for tab group settings
- Unit tests for tab group exclusion and eligibility

---

## [1.3.0] — 2026-09-10

### Added
- Form data loss protection: automatically detects unsaved inputs, textareas, and rich-text content in inactive tabs before suspension
- Settings toggle to enable/disable unsaved form protection (`noSuspendForms`, enabled by default)
- Added `scripting` permission in `manifest.json` for non-invasive input inspection
- Translations in English, Português (Brasil), and Español for form protection
- Unit tests for form protection eligibility

---

## [1.2.0] — 2026-09-10

### Added
- Quick "Never suspend this tab" immunity button in the popup for the active tab (session-scoped)
- Automatic session immunity cleanup on tab closure
- Translations in English, Português (Brasil), and Español for tab immunity controls
- Unit tests verifying tab exemption logic and immunity against force-suspend

---

## [1.1.0] — 2026-09-10

### Added
- Live badge counter on the extension icon showing the number of suspended tabs in real-time
- Settings toggle to enable/disable the icon badge counter in General settings
- Translations in English, Português (Brasil), and Español for badge settings

---

## [1.0.0] — 2024-09-10

### Added
- Automatic tab suspension via `chrome.tabs.discard()` (Manifest V3, zero dependencies)
- Inactivity timer slider — 1 to 60 minutes
- Configurable toggle: don't suspend pinned tabs (default: on)
- Configurable toggle: don't suspend tabs with audio (default: on)
- Suspend tabs when Chrome loses focus / window is minimized
- Advanced Optimization section:
  - **Lazy loading on startup** — discard inactive tabs when Chrome starts
  - **Active tab limit** — suspend LRU tabs when open count exceeds the limit
  - **Aggressive saving mode** — faster alarm (every 30 s) + 5-minute threshold cap
- Whitelist by domain (subdomain-aware, www-safe)
- Whitelist by specific URL (prefix-matched, normalized)
- RAM savings estimate (60 MB / suspended tab) shown in real time
- Lifetime statistics (total suspended tabs + estimated RAM saved) with reset
- Dark / Light mode following system preference
- Trilingual interface — English, Português (Brasil), Español — with in-app language picker
- Global enable / disable toggle
- Quick whitelist buttons in popup for current tab (domain or URL)

### Technical
- Manifest V3 service worker with `chrome.alarms` (no persistent background page)
- `chrome.storage.session` for per-tab activity timestamps (cleared on browser close)
- `chrome.storage.sync` for settings (synced across devices)
- Custom i18n loader (`utils/i18n.js`) for runtime language switching without extension reload
- Unit test suite (Jest) — 75+ cases covering URL utilities, suspension logic, validation
- E2E test suite (Playwright) — 40+ cases covering popup and options UI

---

[Unreleased]: https://github.com/WSixx/chrome-ram-saver/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/WSixx/chrome-ram-saver/releases/tag/v1.0.0
