# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Nothing yet — be the first to contribute!

---

## [1.0.0] — 2024-09-10

### Added
- ⚡ Automatic tab suspension via `chrome.tabs.discard()` (Manifest V3, zero dependencies)
- 🎚️ Inactivity timer slider — 1 to 60 minutes
- 📌 Configurable toggle: don't suspend pinned tabs (default: on)
- 🎵 Configurable toggle: don't suspend tabs with audio (default: on)
- 🪟 Suspend tabs when Chrome loses focus / window is minimized
- 🚀 Advanced Optimization section:
  - **Lazy loading on startup** — discard inactive tabs when Chrome starts
  - **Active tab limit** — suspend LRU tabs when open count exceeds the limit
  - **Aggressive saving mode** — faster alarm (every 30 s) + 5-minute threshold cap
- 🛡️ Whitelist by domain (subdomain-aware, www-safe)
- 🔗 Whitelist by specific URL (prefix-matched, normalized)
- 💾 RAM savings estimate (60 MB / suspended tab) shown in real time
- 📊 Lifetime statistics (total suspended tabs + estimated RAM saved) with reset
- 🌙 Dark / Light mode following system preference
- 🌍 Trilingual interface — English, Português (Brasil), Español — with in-app language picker
- 🔘 Global enable / disable toggle
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
