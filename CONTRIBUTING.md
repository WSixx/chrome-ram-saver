# Contributing to RAM Saver

Thank you for your interest in contributing to **RAM Saver**! This is an open-source, privacy-first Chrome Manifest V3 extension designed to keep memory usage low without any external servers or tracking.

## Project Principles

- **Vanilla JS & Zero Runtime Dependencies**: No frameworks, no bundlers, no transpilation. Extension code must run directly when loaded unpacked in Chrome.
- **100% Local & Zero Telemetry**: Never introduce external network requests (including external fonts, CDNs, analytics, or remote API calls).
- **Trilingual Support**: All user-facing strings must be available in **English (`en`)**, **Português (Brasil) (`pt_BR`)**, and **Español (`es`)**.

## Prerequisites

- **Node.js ≥ 20.19** (Node 22 LTS recommended)
- **Google Chrome** or Chromium (for manual testing and Playwright E2E tests)

## Getting Started

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/WSixx/chrome-ram-saver.git
   cd chrome-ram-saver
   ```
2. **Install development dependencies**:
   ```bash
   npm ci
   ```
3. **Load the extension in Chrome**:
   - Open `chrome://extensions`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked** and select the repository root folder

## Development Guidelines

### Shared Logic
Pure business logic and constants live in `utils/shared.js` (`RamSaverUtils`), which is loaded by:
- `background/service-worker.js` via `importScripts('../utils/shared.js')`
- `popup/popup.html` and `options/options.html` via `<script src="../utils/shared.js"></script>`
- Jest unit tests via `require('../../utils/shared')`

Avoid duplicating normalization, validation, or tab eligibility logic across files.

### Localization (`i18n`)
- Add every new UI key to all three locale files:
  - `_locales/en/messages.json`
  - `_locales/pt_BR/messages.json`
  - `_locales/es/messages.json`
- Use `data-i18n`, `data-i18n-placeholder`, or `data-i18n-title` attributes in HTML and `I18n.t(key, vars)` in JavaScript.
- Unit tests (`tests/unit/i18n.test.js`) automatically verify key parity across all three locales and ensure every `data-i18n*` key in HTML exists in every locale file.

### Code Quality & Testing
Run these commands before opening a pull request:

```bash
npm run lint           # ESLint static analysis (0 errors/warnings expected)
npm run test:unit      # Jest unit tests (logic, validation, manifest, i18n, changelog)
npm run test:coverage  # Unit tests with coverage report
```

To run Playwright end-to-end tests:

```bash
npx playwright install chromium
npm run test:e2e
```

## Commit & Pull Request Process

This repository uses [Conventional Commits](https://www.conventionalcommits.org/) and **Release Please** for automated versioning and changelog generation:

- `feat:` — a new user-facing feature
- `fix:` — a bug fix
- `perf:` — a performance improvement
- `docs:` — documentation updates
- `chore:` — maintenance, dependencies, or tooling
- `ci:` — CI/CD workflow changes
- `test:` — adding or updating tests
- `refactor:` — code restructuring without behavior changes

When opening a Pull Request:
1. Create a focused branch (e.g., `feat/battery-saver-mode` or `fix/whitelist-edge-case`).
2. Ensure `npm run lint` and `npm run test:unit` pass cleanly.
3. Fill out the Pull Request template describing the problem, solution, and verification performed.

## Reporting Bugs & Suggesting Features

Please open an issue on [GitHub Issues](https://github.com/WSixx/chrome-ram-saver/issues) using the appropriate Bug Report or Feature Request template, and include your Chrome version and reproduction steps.
