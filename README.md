# RAM Saver

> An open source Chrome extension that saves RAM by automatically suspending inactive tabs.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/WSixx/chrome-ram-saver/blob/main/LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-teal.svg)](https://github.com/WSixx/chrome-ram-saver)
[![GitHub release](https://img.shields.io/github/v/release/WSixx/chrome-ram-saver?color=teal)](https://github.com/WSixx/chrome-ram-saver/releases)

---

## Features

- ⚡ **Automatic suspension** — tabs inactive for a configurable time are suspended using Chrome's native `tabs.discard()` API
- 💾 **RAM savings display** — see how much memory you've saved in real time
- 🎵 **Smart exclusions** — tabs with audio, pinned tabs, and system pages are configurable exclusions
- 🛡️ **Whitelist** — exclude domains or specific URLs from ever being suspended
- 🎚️ **Flexible timer** — slider from 1 to 60 minutes of inactivity
- 🌍 **Trilingual** — English, Português (Brasil), and Español with a language picker
- 🌙 **Dark/Light mode** — follows your system theme automatically
- 🔘 **Global toggle** — pause all auto-suspension without uninstalling
- 📌 **Suspend on minimize** — suspend tabs when Chrome loses focus
- 🚀 **Advanced optimization** — lazy startup loading, active tab limit, and aggressive saving mode

## How it works

1. The **service worker** listens to tab events and records the last activity timestamp for each tab
2. A **Chrome Alarm** fires every minute to check for tabs that have been inactive past the threshold
3. Eligible tabs are suspended via `chrome.tabs.discard()` — Chrome's native, efficient API
4. Suspended tabs stay in your tab bar and reload on click, just like before

## RAM Estimation

RAM savings are estimated at **60 MB per suspended tab** — a conservative average.
Actual savings vary by tab content. There's no Chrome API that exposes per-tab memory usage in Manifest V3.

## Installation (Development)

1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** → select this folder
5. Done! The RAM Saver icon appears in your toolbar.

## Project Structure

```
ram-saver/
├── manifest.json
├── background/
│   └── service-worker.js     # Core logic: tracking, alarms, suspension, advanced features
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── utils/
│   └── i18n.js               # Custom i18n loader (supports language picker)
├── _locales/
│   ├── en/messages.json
│   ├── pt_BR/messages.json
│   └── es/messages.json
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Testing

The project has two test suites. **Requires Node.js ≥ 18.**

### Setup

```bash
npm install
npx playwright install chromium   # for e2e only
```

### Unit tests (Jest)

Pure logic — no browser, no Chrome APIs. Runs in milliseconds.

```bash
npm run test:unit          # run once
npm run test:watch         # watch mode during development
npm run test:coverage      # with coverage report
```

Covers:
- `normalizeUrl`, `isDomainWhitelisted`, `isUrlWhitelisted`, `isSystemUrl`
- Tab eligibility logic (pinned, audible, whitelist, threshold, aggressive mode)
- Input validation (`isValidDomain`, `isValidUrl`, `normalizeDomain`)

### End-to-end tests (Playwright)

Opens Chrome with the extension installed and tests the real UI.

```bash
npm run test:e2e
```

Covers popup (toggle, timer, stats, buttons) and options page (slider, all toggles, whitelist CRUD, advanced section, stats, about).

### Test structure

```
tests/
├── helpers/
│   └── utils.js              # Shared pure functions (mirrored from source)
├── unit/
│   ├── tab-utils.test.js     # URL utility tests (~25 cases)
│   ├── suspension-logic.test.js  # Eligibility logic tests (~30 cases)
│   └── validation.test.js    # Input validation tests (~20 cases)
└── e2e/
    └── extension.test.js     # Playwright UI tests (~40 cases)
```

---

## Contributing

Contributions are welcome and appreciated! Here's how to get started:

1. **Fork** this repository and clone it locally
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Make your changes** — keep these guidelines in mind:
   - Zero external dependencies (Vanilla JS only)
   - All new user-facing strings must be added to all three locale files (`en`, `pt_BR`, `es`)
   - Follow the existing code style (no bundler, no transpilation)
   - Test by loading the extension unpacked in Chrome (`chrome://extensions`)
4. **Commit** with a clear message:
   ```bash
   git commit -m "feat: add suspend on battery saver mode"
   ```
5. **Open a Pull Request** describing what you changed and why

### Ideas for contributions

- 🌐 Add more language translations
- 📊 Per-tab memory display (if a future Chrome API enables it)
- 🔔 Notification when a tab is about to be suspended
- 🎨 Improve icon design

### Reporting bugs

Open an [issue on GitHub](https://github.com/WSixx/chrome-ram-saver/issues) with:
- Chrome version
- Steps to reproduce
- Expected vs actual behavior

---

## License

MIT © 2024 [WSixx](https://github.com/WSixx)
