import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/api/settings', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'wizard', key: 'wizard_completed', value: 'true' }] }) }));
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const health = {
  generatedAt: new Date().toISOString(),
  automationHealth: { totalExecutions: 4, succeededCount: 3, failedCount: 1, successRatePct: 75 },
  domainEvents: { totalEvents: 8, failedCount: 2, deadLetterCount: 1, recentFailures: [] },
  failedJobs: { totalFailed: 2, recentJobs: [] }, deadLetters: { count: 1 }, apiFailures: { recentErrorCount: 3 },
  marketplaceSyncErrors: { failedCount: 2, recentErrors: [] }, eDocumentErrors: { errorCount: 1, recentErrors: [] },
  accountingPostingErrors: { unpostedInvoiceCount: 5, recentUnposted: [] },
};
const scorecard = (days = 30) => ({
  periodDays: days, generatedAt: new Date().toISOString(),
  totals: { executions: 1, automaticallyCompleted: 1, failed: 0, running: 0, manualTouches: 0, recoveries: 0, accepted: 0, rejected: 0, corrected: 0, straightThroughRatePct: 100, successRatePct: 100, estimatedHoursSaved: 0.1, financialImpact: 0 },
  errorBudget: { targetSuccessRatePct: 95, actualSuccessRatePct: 100, remainingFailures: 0, breached: false },
  processes: [{ process: 'TEST_PROCESS', executions: 1, succeeded: 1, failed: 0, successRatePct: 100, straightThroughRatePct: 100, estimatedMinutesSaved: 5 }],
  feedbackReasons: [], backlog: [], reviewQueue: [{ executionId: 'exec-1', process: 'TEST_PROCESS', startedAt: new Date().toISOString() }],
});

test('health, timeline, scorecard feedback and integrity resolution flows work', async ({ page }) => {
  let healthCalls = 0; let feedbackCalls = 0; let resolved = false;
  await page.route('**/api/operations/health', async (route) => { healthCalls++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: health }) }); });
  await page.route('**/api/operations/timeline/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { entityType: 'INVOICE', entityId: 'INV-TEST', entityCode: 'INV-TEST', status: 'DRAFT', createdAt: new Date().toISOString(), events: [{ id: 'event-1', timestamp: new Date().toISOString(), title: 'Fatura Oluşturuldu', description: 'TEST timeline', actor: 'Test', type: 'INFO' }] } }) }));
  await page.route('**/api/automation-rules/scorecard**', async (route) => { const days = Number(new URL(route.request().url()).searchParams.get('days') ?? 30); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: scorecard(days) }) }); });
  await page.route('**/api/automation-rules/scorecard/feedback/**', async (route) => { feedbackCalls++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { recorded: true } }) }); });
  await page.route('**/api/integrity/scan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { scanTimestamp: new Date().toISOString(), totalRulesChecked: 8, totalAnomaliesFound: 1, autoFixedCount: 0, exceptionCenterCount: 1, anomalies: [{ id: 'anomaly-1', ruleCode: 'PAID_WITHOUT_ALLOCATION', title: 'Test Uyumsuzluk', severity: 'HIGH', entityType: 'INVOICE', entityId: 'inv-1', description: 'Test anomaly', actionTaken: 'SENT_TO_EXCEPTION_CENTER' }] } }) }));
  await page.route('**/api/integrity/exceptions/**/resolve', async (route) => { resolved = true; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true, message: 'Çözüldü' } }) }); });
  await prepare(page); await page.goto('/dashboard/operations');
  await expect(page.getByText('%75')).toBeVisible(); await expect(page.getByText('8', { exact: true }).first()).toBeVisible();
  const before = healthCalls; await page.locator('button').filter({ hasText: /Yenile/ }).click(); await expect.poll(() => healthCalls).toBeGreaterThan(before);
  await page.locator('select:visible').selectOption('INVOICE'); await page.locator('input[placeholder*="SO-"]:visible').fill('INV-TEST'); await page.getByRole('button', { name: 'Sorgula' }).click();
  await expect(page.getByText('TEST timeline')).toBeVisible();
  await page.locator('button').filter({ hasText: /^7 g/ }).click(); await expect(page.getByText('TEST_PROCESS').first()).toBeVisible();
  await page.getByRole('button', { name: /Kabul et/ }).click(); await expect.poll(() => feedbackCalls).toBe(1);
  await page.locator('button').filter({ hasText: /Self-Healing/ }).click(); await expect(page.getByText('Test Uyumsuzluk')).toBeVisible();
  await page.locator('button').filter({ hasText: /Manuel/ }).click(); await expect.poll(() => resolved).toBe(true); await expect(page.getByText('Test Uyumsuzluk')).not.toBeVisible();
});

test('health and timeline failures are visible and retryable', async ({ page }) => {
  let healthRecover = false; let timelineRecover = false; let healthCalls = 0; let timelineCalls = 0;
  await page.route('**/api/operations/health', async (route) => { healthCalls++; await route.fulfill(healthRecover ? { status: 200, contentType: 'application/json', body: JSON.stringify({ data: health }) } : { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) }); });
  await page.route('**/api/operations/timeline/**', async (route) => { timelineCalls++; await route.fulfill(timelineRecover ? { status: 200, contentType: 'application/json', body: JSON.stringify({ data: { entityType: 'SO', entityId: 'SO-1', entityCode: 'SO-1', status: 'DRAFT', createdAt: new Date().toISOString(), events: [] } }) } : { status: 404, contentType: 'application/json', body: JSON.stringify({ error: { message: 'not found' } }) }); });
  await page.route('**/api/automation-rules/scorecard**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: scorecard() }) }));
  await prepare(page); await page.goto('/dashboard/operations');
  await expect(page.getByText(/sağlık verileri alınamadı/i)).toBeVisible({ timeout: 20_000 });
  healthRecover = true; const healthBefore = healthCalls; await page.getByRole('button', { name: 'Tekrar dene' }).first().click(); await expect.poll(() => healthCalls).toBeGreaterThan(healthBefore);
  await page.locator('input[placeholder*="SO-"]:visible').fill('SO-1'); await page.getByRole('button', { name: 'Sorgula' }).click();
  await expect(page.getByText(/zaman çizelgesi alınamadı/i)).toBeVisible({ timeout: 20_000 });
  timelineRecover = true; const timelineBefore = timelineCalls; await page.getByRole('button', { name: 'Tekrar dene' }).first().click(); await expect.poll(() => timelineCalls).toBeGreaterThan(timelineBefore);
});
