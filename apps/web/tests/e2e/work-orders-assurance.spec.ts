import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) { await page.goto('/login'); await page.getByLabel(/E-posta/).fill('admin@axondemo.com'); await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234'); await page.getByRole('button', { name: /Giri.*Yap/ }).click(); await expect(page).toHaveURL(/\/dashboard$/); }
const order = { id: 'wo-1', number: 'TEST_E2E_WO_001', status: 'IN_PROGRESS', plannedQty: 10, producedQty: 4, startDate: '2026-09-30T00:00:00.000Z', endDate: null, createdAt: '2026-09-30T00:00:00.000Z', product: { id: 'p', code: 'TEST-P', name: 'TEST_E2E Mamul' }, bom: { id: 'b', name: 'TEST BOM', version: '1.0' }, _count: { items: 2, operations: 1 } };

test('work order list uses server search, filters, pagination and navigation', async ({ page }) => {
  const requests: string[] = []; const consoleErrors: string[] = []; page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/production/work-orders**', async (route) => { const url = route.request().url(); requests.push(url); if (!url.includes('/work-orders?')) return route.fallback(); const params = new URL(url).searchParams; const visible = !params.get('search') || params.get('search')?.includes('TEST_E2E'); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: visible ? [order] : [], meta: { total: visible ? 21 : 0, page: Number(params.get('page') ?? 1), pageSize: 20, totalPages: visible ? 2 : 0 } }) }); });
  await login(page); await page.goto('/dashboard/production/work-orders'); await expect(page.getByRole('heading', { name: /İş Emirleri/ })).toBeVisible(); await expect(page.getByText('TEST_E2E_WO_001')).toBeVisible(); await expect(page.getByText('4 / 10 AD')).toBeVisible();
  await page.getByLabel(/İş emri veya ürün ara/).fill('TEST_E2E'); await expect.poll(() => requests.some((url) => url.includes('search=TEST_E2E'))).toBe(true);
  await page.getByRole('button', { name: /Devam Ediyor/ }).click(); await expect.poll(() => requests.some((url) => url.includes('status=IN_PROGRESS'))).toBe(true);
  await page.getByRole('button', { name: /Sonraki/ }).click(); await expect.poll(() => requests.some((url) => url.includes('page=2'))).toBe(true);
  await page.getByRole('button', { name: /Temizle/ }).click(); await expect(page.getByLabel(/İş emri veya ürün ara/)).toHaveValue('');
  await expect(page.getByRole('button', { name: /Yeni İş Emri/ }).first()).toBeVisible(); await expect(page.getByRole('link', { name: 'Detay' })).toHaveAttribute('href', '/dashboard/production/work-orders/wo-1');
  expect(consoleErrors).toEqual([]); await page.reload(); await expect(page.getByText('TEST_E2E_WO_001')).toBeVisible(); await page.goBack(); await page.goForward();
});

test('work order list exposes recoverable API error', async ({ page }) => {
  await page.route('**/api/production/work-orders**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) })); await login(page); await page.goto('/dashboard/production/work-orders'); await expect(page.getByRole('heading', { name: /İşlem tamamlanamadı/ })).toBeVisible(); await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible();
});
