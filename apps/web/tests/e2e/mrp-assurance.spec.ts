import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) { await page.goto('/login'); await page.getByLabel(/E-posta/).fill('admin@axondemo.com'); await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234'); await page.getByRole('button', { name: /Giri.*Yap/ }).click(); await expect(page).toHaveURL(/\/dashboard$/); }

const data = {
  summary: { horizonDays: 30, demandProducts: 1, openSalesOrderQty: 20, forecastDemandQty: 0, safetyStockQty: 2, openPurchaseQty: 10, productionRecommendationCount: 1, purchaseRecommendationCount: 1, capacityGapCount: 1 },
  productionRecommendations: [{ product: { id: 'fg', code: 'TEST-FG', name: 'TEST_E2E Mamul' }, bom: { id: 'bom', name: 'TEST BOM', version: '1.0' }, demandQty: 22, openSalesOrderQty: 20, forecastDemandQty: 0, safetyStockQty: 2, stockQty: 3, openWorkOrderQty: 4, minOrderQty: 1, leadTimeDays: 7, suggestedOrderDate: '2026-09-30', expectedAvailabilityDate: '2026-10-07', recommendedQty: 15, capacityHours: 17, capacityAvailableHours: 14, capacityGapHours: 3 }],
  purchaseRecommendations: [{ product: { id: 'rm', code: 'TEST-RM', name: 'TEST_E2E Bileşen' }, source: 'bom_component', parentProduct: { id: 'fg', code: 'TEST-FG', name: 'TEST_E2E Mamul' }, grossRequirementQty: 46, safetyStockQty: 1, stockQty: 15, openPurchaseQty: 10, minOrderQty: 1, leadTimeDays: 7, suggestedOrderDate: '2026-09-30', expectedReceiptDate: '2026-10-07', recommendedQty: 21 }],
  capacityRecommendations: [{ workCenter: { id: 'wc', code: 'TEST-WC', name: 'TEST_E2E İş Merkezi' }, requiredHours: 17, availableHours: 14, allocatedHours: 0, gapHours: 3 }],
};

test('MRP renders production, purchase and capacity calculations with horizon refresh', async ({ page }) => {
  const requests: string[] = []; const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/production/mrp**', async (route) => { requests.push(route.request().url()); const horizon = Number(new URL(route.request().url()).searchParams.get('horizonDays') ?? 30); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...data, summary: { ...data.summary, horizonDays: horizon } } }) }); });
  await login(page); await page.goto('/dashboard/production/mrp');
  await expect(page.getByRole('heading', { name: /MRP ve Üretim Planlama/ })).toBeVisible();
  await expect(page.getByText('TEST_E2E Mamul').first()).toBeVisible(); await expect(page.getByText('15 AD', { exact: true })).toBeVisible();
  await expect(page.getByText('TEST_E2E Bileşen')).toBeVisible(); await expect(page.getByText('21 AD', { exact: true })).toBeVisible();
  await expect(page.getByText('TEST_E2E İş Merkezi')).toBeVisible(); await expect(page.getByRole('cell', { name: '3 saat', exact: true })).toBeVisible();
  await page.getByRole('combobox').selectOption('60'); await expect.poll(() => requests.some((url) => url.includes('horizonDays=60'))).toBe(true);
  const before = requests.length; await page.getByRole('button', { name: /Yenile/ }).click(); await expect.poll(() => requests.length).toBeGreaterThan(before);
  await page.reload(); await expect(page.getByText('TEST_E2E Mamul').first()).toBeVisible(); await page.goBack(); await page.goForward(); expect(consoleErrors).toEqual([]);
});

test('MRP exposes recoverable API and truth-gate error state', async ({ page }) => {
  await page.route('**/api/production/mrp**', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Inventory Truth Gate NO_GO' } }) }));
  await login(page); await page.goto('/dashboard/production/mrp');
  await expect(page.getByText(/MRP planlama verileri alınamadı/)).toBeVisible(); await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible();
});
