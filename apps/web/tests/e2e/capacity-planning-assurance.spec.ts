import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const result = {
  summary: { horizonDays: 14, workCenterCount: 1, calendarDays: 14, shiftCount: 14, downtimeBlockCount: 1, maintenanceBlockCount: 1, blockedHours: 2, bottleneckCount: 1, criticalBottleneckCount: 1, queuedOperationCount: 1 },
  bottlenecks: [{ workCenter: { id: 'wc', code: 'TEST-WC', name: 'TEST_E2E Capacity Center' }, capacityHours: 110, allocatedHours: 100, queuedHours: 15, blockedHours: 2, maintenanceTaskCount: 1, totalLoadHours: 115, availableHours: 0, utilizationPct: 104.5, severity: 'critical' }],
  sequence: [{ id: 'op', workOrderId: 'wo', workOrderNumber: 'TEST_E2E_WO', product: { id: 'p', code: 'TEST-P', name: 'TEST_E2E Product' }, workCenter: { id: 'wc', code: 'TEST-WC', name: 'TEST_E2E Capacity Center' }, operationName: 'TEST_E2E Operation', status: 'PLANNED', stepOrder: 1, plannedStartAt: '2026-09-30T08:00:00.000Z', plannedEndAt: null, workOrderStartDate: '2026-09-30T00:00:00.000Z', workOrderEndDate: null, plannedQty: 10, estimatedHours: 6, queueRank: 1 }],
  calendar: [{ workCenter: { id: 'wc', code: 'TEST-WC', name: 'TEST_E2E Capacity Center' }, date: '2026-09-30', capacityHours: 6, allocatedHours: 7, availableHours: 0, utilizationPct: 116.7, shifts: { shiftCount: 1, hoursPerShift: 6, totalHours: 6 }, blockages: { downtimeHours: 2, maintenanceTaskCount: 1, isFullyBlocked: false, reasons: ['Duruş / kapasite azaltımı', 'Bakım görevi', 'Aşırı yük'] } }],
};

test('capacity planning renders calculations and interactions', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const requests: string[] = []; const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/production/capacity-planning**', async (route) => { requests.push(route.request().url()); const horizon = Number(new URL(route.request().url()).searchParams.get('horizonDays') ?? 14); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...result, summary: { ...result.summary, horizonDays: horizon, calendarDays: horizon } } }) }); });
  await login(page); await page.goto('/dashboard/production/capacity-planning');
  await expect(page.getByRole('heading', { name: /Kapasite Planlama/ })).toBeVisible();
  await expect(page.getByText('TEST_E2E Capacity Center').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: '%104,5', exact: true })).toBeVisible();
  await expect(page.getByText('TEST_E2E Operation')).toBeVisible();
  await expect(page.getByText(/Aşırı yük/)).toBeVisible();
  await page.getByRole('combobox').selectOption('30'); await expect.poll(() => requests.some((url) => url.includes('horizonDays=30'))).toBe(true);
  const before = requests.length; await page.getByRole('button', { name: /Yenile/ }).click(); await expect.poll(() => requests.length).toBeGreaterThan(before);
  await page.reload(); await expect(page.getByText('TEST_E2E Capacity Center').first()).toBeVisible(); await page.goBack(); await page.goForward();
  expect(consoleErrors).toEqual([]);
});

test('capacity planning exposes recoverable API error', async ({ page }) => {
  await page.route('**/api/production/capacity-planning**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Controlled capacity failure' } }) }));
  await login(page); await page.goto('/dashboard/production/capacity-planning');
  await expect(page.getByRole('heading', { name: /İşlem tamamlanamadı/ })).toBeVisible();
  await expect(page.getByText(/Sunucu hatası: 500/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible();
});
