# Privacy Policy — RAM Saver

**Last updated:** November 21, 2026

RAM Saver (`chrome-ram-saver`) is committed to protecting your privacy. This extension operates **100% locally** inside your browser with **zero telemetry, zero analytics, and zero external network requests**.

## Data Collection & Usage

RAM Saver does **not** collect, store externally, sell, or transmit any personal data, browsing history, page contents, form inputs, or usage analytics.

Specifically:
- **Zero outbound network requests:** The extension does not communicate with any remote servers, APIs, or third-party services. All icons, styles, scripts, and localization files are bundled locally.
- **No tracking or analytics:** No cookies, fingerprinting, crash reporting, or telemetry SDKs are used.

## Local & Chrome Sync Storage

All data used by RAM Saver stays within Chrome's built-in extension storage APIs:
- `chrome.storage.sync`: Stores your extension preferences (inactivity timer, behavior toggles, language choice, and domain/URL whitelists) so they can sync across your Chrome profile if Chrome Sync is enabled.
- `chrome.storage.local`: Stores local-only UI state (such as whether the popup tab drawer is collapsed) and aggregate suspension counts.
- `chrome.storage.session`: Stores temporary in-memory tab activity timestamps and per-tab session immunity flags. This data is automatically cleared when Chrome closes.

## Permissions & Host Access

- **`tabs`, `tabGroups`, `alarms`, `contextMenus`, `storage`:** Used strictly to monitor tab inactivity locally, protect pinned/audible/grouped tabs, schedule suspension checks, and discard inactive tabs via Chrome's native `chrome.tabs.discard()` API.
- **`scripting` and `<all_urls>` host permission:** Used exclusively at the moment a background tab is about to be suspended, to:
  1. Check whether the tab has unsaved form inputs, textareas, or editable content (preventing data loss). Only a boolean result (`true`/`false`) is returned to the extension — no text or form content is ever read, stored, or transmitted.
  2. Prepend the `💤` visual indicator to the tab title and switch the tab's favicon to the local suspended icon before discarding.

## Open Source

RAM Saver is open source under the MIT License. You can inspect the complete source code at:
https://github.com/WSixx/chrome-ram-saver

## Contact

If you have any questions about this Privacy Policy, please open an issue on the GitHub repository:
https://github.com/WSixx/chrome-ram-saver/issues
