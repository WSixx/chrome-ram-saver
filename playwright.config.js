const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    // Screenshots and traces on failure
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        // Chrome extensions require a persistent context
        ...devices['Desktop Chrome'],
        // headless: false is needed for extensions in older Playwright
        // Use 'new' for headless mode (Playwright >= 1.40)
        launchOptions: {
          headless: false,
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        },
      },
    },
  ],
});
