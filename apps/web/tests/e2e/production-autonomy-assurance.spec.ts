import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('production autonomy capacity, optimization and maintenance reservation flow', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  let optimizeCalls = 0; let reservationCalls = 0;
  await page.route('**/api/production-autonomy/work-center-capacity', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ workCenterId: 'wc-1', workCenterName: 'TEST_E2E Üretim', code: 'WC-1', capacityHoursPerDay: 8, plannedWorkloadHours: 34, utilizationPct: 85, activeWorkOrdersCount: 1, status: 'BOTTLENECK' }] }) }));
  await page.route('**/api/production-autonomy/predictive-maintenance', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ workCenterId: 'wc-1', workCenterName: 'TEST_E2E Üretim', operatingHours: 810, failureProbabilityPct: 81, riskLevel: 'HIGH', recommendedSpareParts: [{ productId: 'p-1', productName: 'TEST_E2E Rulman', requiredQty: 2, isReserved: false }] }] }) }));
  await page.route('**/api/production-autonomy/optimize-schedule', async (route) => { optimizeCalls++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { totalWorkOrdersScanned: 1, rescheduledCount: 1, bottlenecksEliminated: 1, estimatedTimeSavedHours: 2.5, optimizedAt: new Date().toISOString(), details: [] } }) }); });
  await page.route('**/api/production-autonomy/reserve-maintenance-parts', async (route) => { reservationCalls++; expect(route.request().postDataJSON()).toEqual({ workCenterId: 'wc-1', productId: 'p-1', quantity: 2 }); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true, message: 'Yedek parça rezerve edildi.', reservationId: 'r-1' } }) }); });

  await login(page);
  await page.goto('/dashboard/production/autonomy');
  await expect(page.getByText('TEST_E2E Üretim').first()).toBeVisible();
  await expect(page.getByText('DARBOĞAZ', { exact: true })).toBeVisible();
  await expect(page.getByText('%85')).toBeVisible();
  await page.getByRole('button', { name: /Otonom.*Başlat/ }).click();
  await expect.poll(() => optimizeCalls).toBe(1);
  await page.getByRole('button', { name: /Stokta Kilitle/ }).click();
  await expect.poll(() => reservationCalls).toBe(1);
  await page.reload();
  await expect(page.getByText('TEST_E2E Üretim').first()).toBeVisible();
  await page.goBack(); await page.goForward();
  expect(consoleErrors).toEqual([]);
});

test('production autonomy exposes recoverable query errors', async ({ page }) => {
  await page.route('**/api/production-autonomy/work-center-capacity', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) }));
  await page.route('**/api/production-autonomy/predictive-maintenance', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) }));
  await login(page);
  await page.goto('/dashboard/production/autonomy');
  await expect(page.getByText(/Kapasite verileri alınamadı/)).toBeVisible();
  await expect(page.getByText(/Bakım verileri alınamadı/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Tekrar dene/ })).toHaveCount(2);
});
