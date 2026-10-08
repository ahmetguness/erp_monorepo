import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const close = page.getByRole('button', { name: /Onboarding.*kapat/ });
  await close.waitFor({ state: 'visible', timeout: 1200 }).then(() => close.click()).catch(() => undefined);
}

const holding = {
  generatedAt: '2026-10-07T12:00:00.000Z',
  summary: { companyCount: 1, branchCount: 2, warehouseCount: 2, consolidatedSales: 10010, consolidatedPurchases: 40, consolidatedCollections: 3006, consolidatedStockValue: 210, intercompanyTransferCount: 25 },
  organization: [
    { id: 'holding:t1', parentId: null, label: 'TEST_E2E Holding', type: 'holding', city: 'Istanbul', taxNumber: '111', warehouseCount: 2, stockValue: 210 },
    { id: 'company:t1', parentId: 'holding:t1', label: 'TEST_E2E Holding Operasyon Sirketi', type: 'company', city: 'Istanbul', taxNumber: '111', warehouseCount: 2, stockValue: 210 },
    { id: 'branch:w1', parentId: 'company:t1', label: 'A1 - Merkez', type: 'branch', city: 'Istanbul', taxNumber: null, warehouseCount: 1, stockValue: 150 },
    { id: 'branch:w2', parentId: 'company:t1', label: 'A2 - Sube', type: 'branch', city: 'Ankara', taxNumber: null, warehouseCount: 1, stockValue: 60 },
  ],
  intercompanyTransfers: [{ id: 'm1', productCode: 'TEST-P', productName: 'TEST_E2E Urun', fromBranch: 'A1 - Merkez', toBranch: 'A2 - Sube', quantity: 4, createdAt: '2026-10-07T12:00:00.000Z', status: 'completed' }],
  consolidatedReports: [{ key: 'sales', label: 'Konsolide satis', amount: 10010, recordCount: 1001 }, { key: 'purchases', label: 'Konsolide satin alma', amount: 40, recordCount: 1 }, { key: 'collections', label: 'Konsolide tahsilat', amount: 3006, recordCount: 1002 }, { key: 'stock', label: 'Konsolide stok degeri', amount: 210, recordCount: 2 }],
};

test('holding renders organization, transfers, totals and refresh', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/enterprise/holding', (route) => { calls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: holding }) }); });
  await login(page);
  await page.goto('/dashboard/enterprise/holding');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/irket.*ube/);
  await expect(page.getByText('TEST_E2E Holding').first()).toBeVisible();
  await expect(page.getByText('TEST_E2E Urun')).toBeVisible();
  await expect(page.getByText('Konsolide satis')).toBeVisible();
  await expect(page.getByText('1001')).toBeVisible();
  await expect(page.getByText(/10\.010/).first()).toBeVisible();
  await page.getByRole('button', { name: /Yenile/ }).click();
  await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(page.getByText('A1 - Merkez').first()).toBeVisible();
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/enterprise\/holding/);
});

test('holding error state retries successfully', async ({ page }) => {
  let failing = true;
  await page.route('**/api/enterprise/holding', (route) => route.fulfill(failing ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled holding error' } }) } : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: holding }) }));
  await login(page);
  await page.goto('/dashboard/enterprise/holding');
  await expect(page.getByText('controlled holding error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('TEST_E2E Holding').first()).toBeVisible();
});
