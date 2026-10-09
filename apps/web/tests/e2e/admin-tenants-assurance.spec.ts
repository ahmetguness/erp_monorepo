import { expect, test, type Page } from '@playwright/test';

const admin = { id: 'admin-1', email: 'admin@example.test', name: 'Test Admin', isActive: true, lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z', roles: ['SUPER_ADMIN'], permissions: ['dashboard.read', 'tenant.read', 'tenant.create', 'tenant.export', 'tenant.settings.update', 'tenant.plan.update', 'tenant.status.update'] };
const tenant = { id: 'tenant-1', slug: 'test-e2e-tenant', companyName: 'TEST_E2E_TENANT Türkçe', email: 'tenant@example.test', phone: null, plan: 'ENTERPRISE', status: 'ACTIVE', city: 'İstanbul', sector: null, maxUsers: 25, trialEndsAt: null, subscriptionStart: null, subscriptionEnd: null, planChangedAt: null, isCustomPricing: false, modules: ['ACCOUNTING'], notes: null, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z', _count: { users: 2, products: 3, invoices: 4, contacts: 5 } };

async function login(page: Page) {
  await page.route('**/api/admin/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/admin/auth/login', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { status: 'AUTHENTICATED', admin } }) }));
  await page.route('**/api/admin/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: admin }) }));
  await page.route('**/api/admin/ui-preferences', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { locale: 'tr-TR', highContrast: false, reduceMotion: false, density: 'COMFORTABLE' } }) }));
  await page.goto('/admin/login');
  await page.getByLabel('E-posta adresi').fill('admin@example.test');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('safe-password');
  await page.getByRole('button', { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('tenant list filters, URL state, navigation and empty state work', async ({ page }) => {
  const requests: string[] = [];
  await login(page);
  await page.route('**/api/admin/tenant-provisioning', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/admin/tenant-list-views', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/admin/tenants?**', (route) => {
    requests.push(route.request().url());
    const search = new URL(route.request().url()).searchParams.get('search');
    const rows = search === 'bulunmayan' ? [] : [tenant];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: rows, meta: { total: rows.length, page: 1, pageSize: 20, totalPages: 1 } }) });
  });
  await page.goto('/admin/tenants');
  await expect(page.getByText(tenant.companyName)).toBeVisible();
  const search = page.getByPlaceholder(/irket ad/);
  await search.fill('bulunmayan');
  await expect.poll(() => requests.some((url) => url.includes('search=bulunmayan'))).toBe(true);
  await expect(page.getByText(/hesab.*bulunamad/)).toBeVisible();
  await search.fill('TEST_E2E');
  await expect(page.getByText(tenant.companyName)).toBeVisible();
  await page.getByRole('button', { name: /Yönet/ }).click();
  await expect(page).toHaveURL(/\/admin\/tenants\/tenant-1$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/tenants/);
});

test('tenant list exposes API error and recovers with retry', async ({ page }) => {
  let failing = true;
  await login(page);
  await page.route('**/api/admin/tenant-provisioning', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/admin/tenant-list-views', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/admin/tenants?**', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled tenant list error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [tenant], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } }) }));
  await page.goto('/admin/tenants');
  await expect(page.getByText('controlled tenant list error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText(tenant.companyName)).toBeVisible();
});
