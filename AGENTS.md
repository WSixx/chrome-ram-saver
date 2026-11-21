# AGENTS.md

Guidance for AI coding agents working in the **RAM Saver** (`chrome-ram-saver`) repository.

## Project Overview

RAM Saver is a **Chrome Manifest V3** extension built with **Vanilla JavaScript, HTML, and CSS** — with **zero runtime dependencies**, **no bundler/transpiler**, and a strict **100% local / zero outbound network** guarantee.

Dev dependencies (`eslint`, `jest`, `@playwright/test`, `globals`) are strictly for linting and automated testing.

## Architecture & Key Files

- `manifest.json` — MV3 extension manifest (permissions, commands, icons, service worker, popup, options).
- `utils/shared.js` — **Single source of truth** for constants (`ALARM_NAME`, `RAM_PER_TAB_MB`, `DEFAULT_SETTINGS`) and pure logic (`normalizeUrl`, `normalizeDomain`, `isValidDomain`, `isValidUrl`, `isSystemUrl`, `isTabInGroup`, `findMatchingDomain`, `isDomainWhitelisted`, `findMatchingUrl`, `isUrlWhitelisted`, `isTabImmune`, `isTabEligible`). Exported universally for Service Worker (`importScripts`), browser pages (`<script>` via `globalThis.RamSaverUtils`), and Node/Jest (`module.exports`).
- `utils/i18n.js` — Custom runtime i18n loader supporting `en`, `pt_BR`, `es`, and `auto` system detection, plus `{var}` interpolation in `I18n.t(key, vars)`.
- `background/service-worker.js` — MV3 service worker handling tab activity tracking (`chrome.storage.session`), periodic alarms (`chrome.alarms`), tab suspension (`chrome.tabs.discard()`), unsaved form detection (`chrome.scripting.executeScript`), visual indicators (`💤` title + grayscale favicon), active tab limit, lazy startup, minimize-to-suspend, badge counts, context menus, and keyboard shortcuts.
- `popup/popup.html`, `popup/popup.css`, `popup/popup.js` — Extension popup UI, quick whitelist actions, timer selector, and Window Tabs Manager drawer.
- `options/options.html`, `options/options.css`, `options/options.js` — Full settings page (General, Advanced, Whitelist, Statistics, About).
- `_locales/{en,pt_BR,es}/messages.json` — Trilingual localization files. Every key must exist in all three locales.
- `scripts/extract-changelog.js` — Release note extractor for GitHub Releases.
- `tests/unit/*.test.js` — Jest unit tests covering `utils/shared.js`, `manifest.json`, `_locales/*/messages.json`, and `scripts/extract-changelog.js`.
- `tests/e2e/extension.test.js` — Playwright end-to-end tests launching Chromium with the unpacked extension loaded.

## Non-Negotiable Rules

1. **Zero Runtime Dependencies & No Bundler**: Do not add runtime `dependencies` to `package.json` or require a build step for extension files. Files in `background/`, `popup/`, `options/`, and `utils/` must run directly in Chrome.
2. **Zero Outbound Network / Zero Telemetry**: Never add external CDNs, Google Fonts, analytics, telemetry, or remote `fetch()` calls. All fonts, icons, and locale files must remain local.
3. **Single Source of Truth**: Pure URL/domain/eligibility logic belongs in `utils/shared.js`. Do not duplicate helper functions across `service-worker.js`, `popup.js`, `options.js`, or test helpers.
4. **Safe DOM Rendering**: Use `document.createElement` and `textContent` when rendering user-supplied or tab-supplied data (titles, URLs, domains) — avoid `innerHTML` with dynamic strings.
5. **Trilingual i18n Parity**: Any new or changed UI string must be added to `_locales/en/messages.json`, `_locales/pt_BR/messages.json`, and `_locales/es/messages.json`. Do not hardcode user-facing copy in JS.
6. **Environment-Scoped ESLint**: `eslint.config.mjs` separates Service Worker, Browser, CommonJS, and Jest environments. Keep runtime extension scripts free of Node globals (`require`, `process`, `module` except the UMD export guard in `utils/shared.js`).
7. **Versioning & Releases**: Releases are automated via `release-please` (`release-please-config.json`, `.release-please-manifest.json`). Do not manually bump versions in `package.json` or `manifest.json` unless specifically performing a release; follow **Conventional Commits** (`feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `ci:`, `test:`, `refactor:`).

## Common Commands

Requires **Node.js ≥ 20.19** (Node 22 LTS recommended).

```bash
npm ci                 # Install dev dependencies
npm run lint           # Run ESLint across all JS/MJS files
npm run test:unit      # Run Jest unit tests
npm run test:coverage  # Run Jest unit tests with coverage report
npm run test:e2e       # Run Playwright E2E tests (requires Chromium installed)
```

## Verification Checklist Before Finishing

- Run `npm run lint` (must pass with 0 errors and 0 warnings).
- Run `npm run test:unit` (all suites must pass, including `i18n.test.js` parity & HTML key checks and `manifest.test.js` asset checks).
- Run `npm run test:e2e` whenever UI, manifest, or browser interaction code changes (when a display/Chromium environment is available).
