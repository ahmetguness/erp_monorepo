import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = process.env.ADMIN_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const externalWebServer = process.env.ADMIN_E2E_EXTERNAL_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{
    name: 'admin-chromium',
    use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
  }],
  webServer: externalWebServer ? undefined : {
    command: `node ../../node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  outputDir: 'test-results/playwright',
});
