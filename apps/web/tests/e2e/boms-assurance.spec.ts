import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const bom = { id: 'bom-1', productId: 'p-1', name: 'TEST_E2E_BOM Reçete', version: '1.0', isActive: true, createdAt: '2026-10-01T00:00:00.000Z', product: { id: 'p-1', code: 'TEST-FG', name: 'TEST Mamul' }, _count: { items: 1, routings: 1, workOrders: 2 } };

test('BOM list uses server search/status/pagination and exposes create modal', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/production/boms**', async (route) => {
    if (route.request().method() === 'PATCH') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...bom, isActive: false } }) });
    const url = route.request().url(); requests.push(url);
    if (!url.includes('/boms?')) return route.fallback();
    const params = new URL(url).searchParams;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [bom], meta: { total: 21, page: Number(params.get('page') ?? 1), pageSize: 20, totalPages: 2 } }) });
  });
  await login(page); await page.goto('/dashboard/production/boms');
  await expect(page.getByText('TEST_E2E_BOM Reçete')).toBeVisible();
  await page.getByLabel(/BOM veya ürün ara/).fill('TEST_E2E'); await expect.poll(() => requests.some((url) => url.includes('search=TEST_E2E'))).toBe(true);
  await page.getByRole('button', { name: 'Aktif', exact: true }).click(); await expect.poll(() => requests.some((url) => url.includes('status=active'))).toBe(true);
  await page.getByRole('button', { name: 'Sonraki' }).click(); await expect.poll(() => requests.some((url) => url.includes('page=2'))).toBe(true);
  await page.getByRole('button', { name: /Temizle/ }).click(); await expect(page.getByLabel(/BOM veya ürün ara/)).toHaveValue('');
  await page.getByRole('button', { name: 'Durum değiştir' }).click();
  await page.getByRole('button', { name: 'Yeni BOM' }).first().click(); await expect(page.getByRole('heading', { name: 'Yeni BOM' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Oluştur' })).toBeDisabled(); await page.getByRole('button', { name: 'İptal' }).click();
  await page.getByRole('button', { name: 'Detay' }).click(); await expect(page).toHaveURL(/\/dashboard\/production\/boms\/bom-1$/);
});

test('BOM detail renders engineering data and scoped delete controls', async ({ page }) => {
  await page.route('**/api/production/boms/bom-1/engineering', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { bomId: 'bom-1', generatedAt: new Date().toISOString(), summary: { revisionCount: 1, activeRevisionCount: 1, alternativeSuggestionCount: 0, routeStepCount: 1, plannedCostTotal: 100, actualCostTotal: 90, variancePct: -10 }, revisions: [{ id: 'bom-1', version: '1.0', isActive: true, effectiveFrom: null, effectiveTo: null, itemCount: 1, routingCount: 1, workOrderCount: 2, status: 'active' }], alternativeMaterials: [{ bomItemId: 'item-1', primaryProduct: { id: 'raw', code: 'RAW', name: 'Hammadde' }, requiredQty: 2.5, unit: 'KG', primaryUnitCost: 10, alternatives: [] }], operationRoutes: [{ routingId: 'route-1', stepOrder: 1, operationName: 'Kesim', workCenter: { id: 'wc', code: 'WC', name: 'Kesim Merkezi' }, setupMinutes: 60, runMinutesPerUnit: 30, laborRate: 60, overheadRate: 30, plannedCostPerUnit: 135 }], costComparison: [] } }) }));
  await page.route('**/api/production/boms/bom-1', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...bom, items: [{ id: 'item-1', productId: 'raw', quantity: 2.5, unit: 'KG', product: { id: 'raw', code: 'RAW', name: 'Hammadde' } }], routings: [{ id: 'route-1', name: 'Kesim', stepOrder: 1, setupTime: 60, runTime: 30, workCenter: { id: 'wc', code: 'WC', name: 'Kesim Merkezi' } }] } }) }));
  await login(page); await page.goto('/dashboard/production/boms/bom-1');
  await expect(page.getByRole('heading', { name: 'TEST_E2E_BOM Reçete' })).toBeVisible(); await expect(page.getByText('Hammadde', { exact: true })).toBeVisible(); await expect(page.getByText('₺135')).toBeVisible();
  await expect(page.getByRole('button', { name: /Hammadde malzemesini kaldır/ })).toBeVisible(); await expect(page.getByRole('button', { name: /Kesim operasyonunu kaldır/ })).toBeVisible();
});

test('BOM list exposes recoverable API error', async ({ page }) => {
  await page.route('**/api/production/boms**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) }));
  await login(page); await page.goto('/dashboard/production/boms'); await expect(page.getByRole('heading', { name: /İşlem tamamlanamadı/ })).toBeVisible(); await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible();
});
