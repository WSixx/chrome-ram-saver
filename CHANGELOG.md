# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.10.0](https://github.com/WSixx/chrome-ram-saver/compare/v1.9.2...v1.10.0) (2026-09-13)


### Features

* **ci:** setup Google Release Please automated release management ([1289cd5](https://github.com/WSixx/chrome-ram-saver/commit/1289cd5d37649a2aee09b0fc128c67ae668a2ac7))
* **ci:** setup Google Release Please automated release management ([e40edd3](https://github.com/WSixx/chrome-ram-saver/commit/e40edd351a2dfff96d2f502b733ac8180d1a0359))


### Dependencies & Maintenance

* **config:** include dependencies and maintenance in changelog sect… ([986ba3c](https://github.com/WSixx/chrome-ram-saver/commit/986ba3c6d23461c595bc81cc8eddf2de03e333cc))
* **config:** include dependencies and maintenance in changelog sections ([9369d87](https://github.com/WSixx/chrome-ram-saver/commit/9369d87d95c6380feb90edb5df325221d82f4489))
* **deps-dev:** bump jest from 29.7.0 to 30.5.1 ([964dcdb](https://github.com/WSixx/chrome-ram-saver/commit/964dcdb34db439cce5946a50fa785c34c1c57406))
* **deps:** bump actions/cache from 4 to 6 ([ca6caaf](https://github.com/WSixx/chrome-ram-saver/commit/ca6caaf5381f7836acddc2f3e18d78e35837cef3))
* **deps:** bump actions/checkout from 4 to 7 ([9f91633](https://github.com/WSixx/chrome-ram-saver/commit/9f9163326c8daeda4f5765b0e7f2ee3ed0b6dfa9))
* **deps:** bump actions/checkout from 4 to 7 ([095669b](https://github.com/WSixx/chrome-ram-saver/commit/095669be2385a4424f15879ad5631513527cdf4e))
* **deps:** bump actions/checkout from 4 to 7 ([b76c10c](https://github.com/WSixx/chrome-ram-saver/commit/b76c10c28777f8c631834b7b6ab86282b729e659))
* **deps:** bump actions/setup-node from 4 to 7 ([f94d7fe](https://github.com/WSixx/chrome-ram-saver/commit/f94d7feab0e038bf8ffbb48e2c86d71917e815b8))
* **deps:** bump googleapis/release-please-action from 4 to 5 ([febd101](https://github.com/WSixx/chrome-ram-saver/commit/febd10125de2b09c570d5b164d2a215bc2e59371))
* **deps:** bump googleapis/release-please-action from 4 to 5 ([d345646](https://github.com/WSixx/chrome-ram-saver/commit/d34564651fb3ac427d67c0720d8cd5ae88bf800c))
* **deps:** bump softprops/action-gh-release from 2 to 3 ([3e0c49f](https://github.com/WSixx/chrome-ram-saver/commit/3e0c49ffa14304787f907d06f5b4dcb1c81a2319))

## [1.9.2] — 2026-09-12

### Added
- ESLint code quality & static analysis configured for Manifest V3 extension globals and tests (`npm run lint`)
- Automated ESLint step added to GitHub Actions CI workflow to catch bugs and undeclared variables before merging
- Trilingual localization parity unit test (`tests/unit/i18n.test.js`) ensuring all keys exist across `en`, `pt_BR`, and `es`
- Robust changelog extraction script (`scripts/extract-changelog.js`) ensuring complete markdown notes in GitHub Releases
- GitHub Actions npm cache optimization for faster CI test runs
- Automatic SHA-256 integrity checksum generation and attachment to GitHub Releases
- GitHub issue templates (`bug_report.md`, `feature_request.md`), Pull Request template, and Dependabot automation
- Modernized README header badges with official CI status, release tag, Chrome MV3, ESLint, and Zero-telemetry shields

---

## [1.9.1] — 2026-09-12

### Fixed
- Window Tabs Manager: waking up (`🔄`) or selecting a suspended tab now immediately forces Chrome to reload and restore the page, rather than only focusing the discarded tab
- Popup UI: restored missing `currentTabRow` DOM reference, resolving `ReferenceError` that caused the whitelist action row to appear compressed with empty buttons on system pages

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
