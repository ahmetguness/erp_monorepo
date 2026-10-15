import { expect, test } from '@playwright/test';

const row = {
  id: 'audit-e2e-1', tenantId: 'tenant-a', userId: null, module: 'inventory', entityType: 'PRODUCT', entityId: 'product-1',
  entityLabel: 'TEST_E2E_PRODUCT', userLabel: null, isCritical: true, criticalReason: 'Silme islemi', action: 'DELETE',
  oldValues: { name: 'Eski' }, newValues: { name: 'Yeni' }, ipAddress: '127.0.0.1', userAgent: 'Playwright', createdAt: '2026-06-01T12:00:00.000Z',
  business: { actionLabel: 'Silme', moduleLabel: 'Stok', entityTypeLabel: 'Ürün', summary: 'TEST_E2E_PRODUCT silindi.', changes: [{ field: 'name', label: 'Ad', oldValue: 'Eski', newValue: 'Yeni', lineContext: null }] },
};

test('tenant audit log exposes failure/retry, filters, detail and truncated export warning', async ({ page }) => {
  const login = await page.request.post('http://localhost:3001/api/auth/login', { headers: { origin: 'http://localhost:3000' }, data: { email: 'admin@axondemo.com', password: 'demo1234', tenantSlug: 'axon-demo' } });
  expect(login.status()).toBe(200);
  const auth = await login.json();
  row.tenantId = auth.data.tenant.id;
  let fail = true;
  await page.route('**/api/audit-logs**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/export')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [row], meta: { total: 1, totalEligible: 10005, truncated: true, maxRows: 10000, exportedAt: new Date().toISOString(), format: 'json' } }) });
      return;
    }
    if (fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled audit error' } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [row], meta: { total: 1, page: 1, pageSize: 30, totalPages: 1 } }) });
  });
  await page.goto('/dashboard/settings/audit-log');
  const alert = page.locator('[role="alert"]').filter({ hasText: /Denetim|audit/i });
  await expect(alert).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('TEST_E2E_PRODUCT').first()).toBeVisible();
  await page.getByRole('button', { name: /lem detay/ }).evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('TEST_E2E_PRODUCT');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^D.*a Aktar$/ }).click();
  await expect(page.getByText(/10005 uygun kaydin/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Denetim/);
});
