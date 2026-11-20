import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.QUALITY_BASE_URL;
const longSession = Number(process.env.QUALITY_LONG_SESSION_SECONDS ?? 0);
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || !process.env.QUALITY_FIXTURE_FILE || !process.env.QUALITY_REPORT_DIRECTORY)
  throw new Error('Explicit owned local quality fixture required');
export default defineConfig({
  testDir: './tests/quality', fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  testMatch: longSession > 0 ? /long-session\.spec\.ts/ : /resilience\.spec\.ts/,
  timeout: 45000, expect: { timeout: 10000 },
  use: { baseURL, trace: 'off', video: 'off', screenshot: 'only-on-failure' },
  reporter: [['line'], ['json', { outputFile: process.env.QUALITY_REPORT_DIRECTORY + '/results.json' }], ['junit', { outputFile: process.env.QUALITY_REPORT_DIRECTORY + '/junit.xml' }]],
  projects: [{ name: 'quality-chromium', use: { ...devices['Desktop Chrome'] } }, ...(longSession > 0 ? [] : [{ name: 'quality-firefox', use: { ...devices['Desktop Firefox'] } }])],
  outputDir: process.env.QUALITY_REPORT_DIRECTORY + '/output',
});
