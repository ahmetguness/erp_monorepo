import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page.evaluate(async () => ((await (await fetch('http://localhost:3001/api/auth/me', { credentials: 'include' })).json()) as any).data.tenant.id as string);
}

test('check/promissory API error is visible and retryable', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/check-promissory**', async (route) => {
    requests += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled check failure' } }) });
  });
  await login(page);
  await page.goto('/dashboard/check-promissory');
  await expect(page.getByRole('heading', { name: /lem tamamlanamad/ })).toBeVisible();
  const before = requests;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test('check/promissory create, filter, edit, status and delete controls work', async ({ page }) => {
  let rows: any[] = [], mutationRequests = 0, tenantId = '';
  await page.route('**/api/check-promissory**', async (route) => {
    const request = route.request(), method = request.method(), url = new URL(request.url());
    if (method === 'GET') {
      const type = url.searchParams.get('type'), status = url.searchParams.get('status');
      const filtered = rows.filter((row) => (!type || row.type === type) && (!status || row.status === status));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: filtered, meta: { total: filtered.length, page: 1, pageSize: 20, totalPages: filtered.length ? 1 : 0 } }) });
    }
    const parts = url.pathname.split('/');
    const id = url.pathname.endsWith('/status') ? parts.at(-2) : parts.at(-1);
    if (method === 'POST') {
      mutationRequests += 1;
      const body = request.postDataJSON(); rows = [{ id: 'note-1', tenantId, contactId: null, status: 'PENDING', currencyCode: 'TRY', bankName: null, notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...body }];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: rows[0] }) });
    }
    if (method === 'PATCH') {
      const body = request.postDataJSON(); rows = rows.map((row) => row.id === id ? { ...row, ...body, bankName: body.bankName ?? row.bankName, notes: body.notes ?? row.notes } : row);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: rows.find((row) => row.id === id) }) });
    }
    rows = rows.filter((row) => row.id !== id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true } }) });
  });
  tenantId = await login(page);
  await page.goto('/dashboard/check-promissory');
  await expect(page.getByText(/bulunamad/)).toBeVisible();
  await page.getByRole('button', { name: /Yeni.*Senet/ }).click();
  await page.getByLabel('Numara').fill('TEST_E2E_UI_CHECK');
  await page.getByLabel('Tutar').fill('1000');
  await page.getByLabel('Vade Tarihi').fill('2026-12-01');
  await page.getByRole('textbox', { name: 'Banka', exact: true }).fill('Test Bank');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect.poll(() => mutationRequests).toBe(1);
  await expect(page.getByText('TEST_E2E_UI_CHECK')).toBeVisible();
  await page.getByRole('button', { name: /TEST_E2E_UI_CHECK.*zenle/ }).click();
  await page.getByLabel('Tutar').fill('1500');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/1\.500,00/)).toBeVisible();
  await page.getByRole('button', { name: /Bankaya Ver/ }).click();
  await expect(page.getByRole('table').getByText('Bankaya Verildi')).toBeVisible();
  rows[0].status = 'PENDING';
  await page.reload();
  await page.getByRole('button', { name: /TEST_E2E_UI_CHECK.*sil/ }).click();
  await expect(page.getByText(/numaral.*kay.*t silinecek/)).toBeVisible();
  await page.getByRole('button', { name: 'Sil', exact: true }).click();
  await expect(page.getByText(/bulunamad/)).toBeVisible();
});

test('real check/promissory page supports refresh and browser history without request or console errors', async ({ page }) => {
  const failed: string[] = [], errors: string[] = [];
  page.on('response', (response) => { if (response.url().includes('/api/check-promissory') && response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await login(page);
  await page.goto('/dashboard/check-promissory');
  await expect(page.getByRole('heading', { name: /Senet/ })).toBeVisible();
  await page.goto('/dashboard/payments'); await page.goBack(); await expect(page).toHaveURL(/check-promissory/);
  await page.reload(); await expect(page.getByRole('heading', { name: /Senet/ })).toBeVisible();
  expect(failed).toEqual([]); expect(errors.filter((value) => !value.includes('favicon') && !value.includes('currency-rates') && !value.includes('502 (Bad Gateway)'))).toEqual([]);
});
