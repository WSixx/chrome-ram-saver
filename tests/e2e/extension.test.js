// =============================================================================
// tests/e2e/extension.test.js
// End-to-end tests for the RAM Saver Chrome extension UI.
// Uses Playwright with a persistent Chrome context that loads the extension.
//
// Prerequisites:
//   npm install
//   npx playwright install chromium
//   npm run test:e2e
// =============================================================================

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../../');
let context;
let extensionId;

// ---------------------------------------------------------------------------
// Setup: launch Chrome with the extension loaded
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const userDataDir = path.join(__dirname, '../.tmp-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  // Discover the extension ID from the service worker URL
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  extensionId = background.url().split('/')[2];
});

test.afterAll(async () => {
  await context.close();
});

// ---------------------------------------------------------------------------
// Helper: open a new page at an extension URL
// ---------------------------------------------------------------------------
async function openExtensionPage(relativePath) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${relativePath}`);
  return page;
}

// ---------------------------------------------------------------------------
// Popup tests
// ---------------------------------------------------------------------------
test.describe('Popup', () => {
  let popup;

  test.beforeEach(async () => {
    popup = await openExtensionPage('popup/popup.html');
    // Wait for the I18n init and DOM to settle
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(500);
  });

  test.afterEach(async () => {
    await popup.close();
  });

  test('renders the RAM Saver title', async () => {
    const title = popup.locator('.header-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('RAM Saver');
  });

  test('global toggle is visible and interactive', async () => {
    const toggle = popup.locator('#global-toggle');
    await expect(toggle).toBeVisible();

    const isChecked = await toggle.isChecked();
    // Toggle it and check state changed
    await toggle.click();
    await expect(toggle).toBeChecked({ checked: !isChecked });
    // Restore
    await toggle.click();
  });

  test('status badge is displayed', async () => {
    const badge = popup.locator('.status-badge');
    await expect(badge).toBeVisible();

    const dot = popup.locator('.status-dot');
    await expect(dot).toBeVisible();

    const text = popup.locator('.status-text');
    await expect(text).toBeVisible();
    await expect(text).not.toBeEmpty();
  });

  test('RAM saved stat card is displayed', async () => {
    const card = popup.locator('#stat-mb');
    await expect(card).toBeVisible();
  });

  test('tabs suspended stat card is displayed', async () => {
    const card = popup.locator('#stat-tabs');
    await expect(card).toBeVisible();
  });

  test('timer select contains 2-minute option', async () => {
    const select = popup.locator('#timer-select');
    await expect(select).toBeVisible();

    const option = select.locator('option[value="2"]');
    await expect(option).toHaveCount(1);
  });

  test('timer select can be changed', async () => {
    const select = popup.locator('#timer-select');
    await select.selectOption('5');
    await expect(select).toHaveValue('5');
    // Restore default
    await select.selectOption('30');
  });

  test('Suspend All button is visible', async () => {
    const btn = popup.locator('#btn-suspend-all');
    await expect(btn).toBeVisible();
  });

  test('Suspend All button is enabled when toggle is ON', async () => {
    const toggle = popup.locator('#global-toggle');
    if (!(await toggle.isChecked())) await toggle.click();

    const btn = popup.locator('#btn-suspend-all');
    await expect(btn).toBeEnabled();
  });

  test('Suspend All button is disabled when toggle is OFF', async () => {
    const toggle = popup.locator('#global-toggle');
    if (await toggle.isChecked()) await toggle.click(); // turn off

    const btn = popup.locator('#btn-suspend-all');
    await expect(btn).toBeDisabled();

    // Restore
    await toggle.click();
  });

  test('Settings button is visible and opens options page', async () => {
    const btn = popup.locator('#btn-settings');
    await expect(btn).toBeVisible();

    // Click settings should open options page (new tab or focus)
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      btn.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toContain('options/options.html');
    await newPage.close();
  });

  test('whitelist domain button is visible for current tab', async () => {
    // The current-tab-row may be hidden if the popup tab has no valid URL
    // This test just checks the element exists in DOM
    const row = popup.locator('#current-tab-row');
    await expect(row).toBeAttached();
  });
});

// ---------------------------------------------------------------------------
// Options page tests
// ---------------------------------------------------------------------------
test.describe('Options Page', () => {
  let options;

  test.beforeEach(async () => {
    options = await openExtensionPage('options/options.html');
    await options.waitForLoadState('domcontentloaded');
    await options.waitForTimeout(500);
  });

  test.afterEach(async () => {
    await options.close();
  });

  // -- Navigation --
  test('sidebar has all expected navigation items', async () => {
    const sections = ['general', 'advanced', 'whitelist', 'stats', 'about'];
    for (const section of sections) {
      const navItem = options.locator(`.nav-item[data-section="${section}"]`);
      await expect(navItem).toBeVisible();
    }
  });

  test('General section is visible by default', async () => {
    const section = options.locator('#general');
    await expect(section).toBeVisible();
    await expect(section).not.toHaveClass(/hidden/);
  });

  test('Advanced section is hidden by default', async () => {
    const section = options.locator('#advanced');
    await expect(section).toHaveClass(/hidden/);
  });

  test('clicking Advanced nav shows advanced section', async () => {
    await options.locator('.nav-item[data-section="advanced"]').click();
    const section = options.locator('#advanced');
    await expect(section).not.toHaveClass(/hidden/);
  });

  test('clicking Whitelist nav shows whitelist section', async () => {
    await options.locator('.nav-item[data-section="whitelist"]').click();
    const section = options.locator('#whitelist');
    await expect(section).not.toHaveClass(/hidden/);
  });

  // -- General section --
  test('auto-suspend toggle is present', async () => {
    await expect(options.locator('#opt-enable')).toBeVisible();
  });

  test('inactivity timer slider is present with correct range', async () => {
    const slider = options.locator('#opt-timer');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('min', '1');
    await expect(slider).toHaveAttribute('max', '60');
    await expect(slider).toHaveAttribute('type', 'range');
  });

  test('timer display updates when slider is moved', async () => {
    const slider = options.locator('#opt-timer');
    const display = options.locator('#timer-display');

    // Set slider to 10
    await slider.fill('10');
    await slider.dispatchEvent('input');
    await expect(display).toHaveText('10 min');
  });

  test('noSuspendAudio toggle is present', async () => {
    await expect(options.locator('#opt-no-audio')).toBeVisible();
  });

  test('noSuspendPinned toggle is present', async () => {
    await expect(options.locator('#opt-no-pinned')).toBeVisible();
  });

  test('suspendOnMinimize toggle is present', async () => {
    await expect(options.locator('#opt-suspend-minimize')).toBeVisible();
  });

  test('language selector has all 4 options', async () => {
    const select = options.locator('#opt-lang');
    await expect(select).toBeVisible();
    const options_list = select.locator('option');
    await expect(options_list).toHaveCount(4);
  });

  // -- Advanced section --
  test('Advanced section has all expected toggles', async () => {
    await options.locator('.nav-item[data-section="advanced"]').click();
    await expect(options.locator('#opt-lazy')).toBeVisible();
    await expect(options.locator('#opt-tab-limit')).toBeVisible();
    await expect(options.locator('#opt-aggressive')).toBeVisible();
  });

  test('tab limit number input is hidden by default', async () => {
    await options.locator('.nav-item[data-section="advanced"]').click();
    const control = options.locator('#tab-limit-control');
    await expect(control).toHaveClass(/hidden/);
  });

  test('enabling tab limit shows number input', async () => {
    await options.locator('.nav-item[data-section="advanced"]').click();
    const toggle = options.locator('#opt-tab-limit');
    if (!(await toggle.isChecked())) await toggle.click();

    const control = options.locator('#tab-limit-control');
    await expect(control).not.toHaveClass(/hidden/);

    // Restore
    await toggle.click();
  });

  // -- Whitelist section --
  test('domain input and add button are present in whitelist', async () => {
    await options.locator('.nav-item[data-section="whitelist"]').click();
    await expect(options.locator('#domain-input')).toBeVisible();
    await expect(options.locator('#btn-add-domain')).toBeVisible();
  });

  test('URL input and add button are present in whitelist', async () => {
    await options.locator('.nav-item[data-section="whitelist"]').click();
    await expect(options.locator('#url-input')).toBeVisible();
    await expect(options.locator('#btn-add-url')).toBeVisible();
  });

  test('adding invalid domain shows error message', async () => {
    await options.locator('.nav-item[data-section="whitelist"]').click();
    await options.locator('#domain-input').fill('not-a-valid-domain');
    await options.locator('#btn-add-domain').click();
    const error = options.locator('#domain-error');
    await expect(error).not.toBeEmpty();
  });

  test('adding valid domain adds it to the list and clears input', async () => {
    await options.locator('.nav-item[data-section="whitelist"]').click();
    const testDomain = `test-e2e-${Date.now()}.com`;
    await options.locator('#domain-input').fill(testDomain);
    await options.locator('#btn-add-domain').click();

    // Input should be cleared
    await expect(options.locator('#domain-input')).toHaveValue('');
    // Domain should appear in list
    const listItem = options.locator('#whitelist-list').locator(`text=${testDomain}`);
    await expect(listItem).toBeVisible();

    // Cleanup: remove the domain
    const removeBtn = options.locator('#whitelist-list .btn-remove').first();
    await removeBtn.click();
  });

  test('adding invalid URL shows error message', async () => {
    await options.locator('.nav-item[data-section="whitelist"]').click();
    await options.locator('#url-input').fill('not-a-url');
    await options.locator('#btn-add-url').click();
    const error = options.locator('#url-error');
    await expect(error).not.toBeEmpty();
  });

  // -- Stats section --
  test('stats section shows total suspended and RAM saved', async () => {
    await options.locator('.nav-item[data-section="stats"]').click();
    await expect(options.locator('#stat-total-tabs')).toBeVisible();
    await expect(options.locator('#stat-total-mb')).toBeVisible();
  });

  test('reset stats button is present in stats section', async () => {
    await options.locator('.nav-item[data-section="stats"]').click();
    await expect(options.locator('#btn-reset-stats')).toBeVisible();
  });

  // -- About section --
  test('about section shows version', async () => {
    await options.locator('.nav-item[data-section="about"]').click();
    const version = options.locator('#about-version');
    await expect(version).toBeVisible();
    await expect(version).toContainText('v1.0.0');
  });
});
