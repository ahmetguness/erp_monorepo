import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = process.env.ADMIN_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const externalWebServer = process.env.ADMIN_E2E_EXTERNAL_SERVER === '1';
const smokeTests = /(?:admin-auth-and-authorization|contacts-assurance|invoices-assurance|tenant-users-assurance)\.spec\.ts/;
const tenantTests = /(?:contacts|tenant-users|tenant-audit-log)-assurance\.spec\.ts/;
const adminTests = /admin-.*\.spec\.ts/;
const chromium = { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [
    ['line'],
    ['junit', { outputFile: 'test-results/playwright/junit.xml' }],
    ['json', { outputFile: 'test-results/playwright/results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ] : 'line',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'smoke-chromium', testMatch: smokeTests, use: chromium },
    { name: 'tenant-chromium', testMatch: tenantTests, use: chromium },
    { name: 'admin-chromium', testMatch: adminTests, use: chromium },
    { name: 'regression-chromium', use: chromium },
    { name: 'smoke-firefox', testMatch: smokeTests, use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: externalWebServer ? undefined : {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  outputDir: 'test-results/playwright',
});
