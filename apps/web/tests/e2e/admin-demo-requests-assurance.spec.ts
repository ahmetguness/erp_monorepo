import { expect, test, type Page, type Route } from '@playwright/test';

const admin = { id: 'admin-demo-1', email: 'demo-admin@example.test', name: 'Demo Admin', isActive: true, lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z', roles: ['SUPER_ADMIN'], permissions: ['dashboard.read', 'demo.read', 'demo.approve', 'demo.reject'] };
const request = {
  id: 'demo-request-1', fullName: 'TEST E2E Yetkili', companyName: 'TEST_E2E_DEMO Şirket, A.Ş.', email: 'demo@example.test', phone: '+905551112233', plan: 'STARTER', status: 'PENDING', tenantId: null, notes: null, rejectedReason: null, processedBy: null, ownerId: null,
  slaDueAt: '2026-10-09T00:00:00.000Z', slaBreached: false, duplicateWarnings: [{ kind: 'COMPANY', message: 'Benzer şirket uyarısı' }],
  history: [{ id: 'history-1', action: 'CREATED', note: null, actorId: null, createdAt: '2026-10-08T00:00:00.000Z' }], createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
};

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function login(page: Page) {
  await page.route('**/api/admin/**', (route) => json(route, { data: [] }));
  await page.route('**/api/admin/auth/login', (route) => json(route, { data: { status: 'AUTHENTICATED', admin } }));
  await page.route('**/api/admin/auth/me', (route) => json(route, { data: admin }));
  await page.route('**/api/admin/ui-preferences', (route) => json(route, { data: { locale: 'tr-TR', highContrast: false, reduceMotion: false, density: 'COMFORTABLE' } }));
  await page.goto('/admin/login');
  await page.getByLabel('E-posta adresi').fill(admin.email);
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('safe-password');
  await page.getByRole('button', { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('demo request filters, assignment, note, preview and approval work', async ({ page }) => {
  const calls: string[] = [];
  await login(page);
  await page.route('**/api/admin/demo-requests?**', (route) => {
    calls.push(route.request().url());
    return json(route, { data: [request], total: 1, page: 1, limit: 50 });
  });
  await page.route('**/api/admin/demo-requests/demo-request-1/assign', (route) => { calls.push('assign'); return json(route, { data: { ...request, ownerId: admin.id } }); });
  await page.route('**/api/admin/demo-requests/demo-request-1/notes', (route) => { calls.push(`note:${route.request().postData()}`); return json(route, { data: request }); });
  await page.route('**/api/admin/demo-requests/demo-request-1/preview', (route) => json(route, { data: { requestId: request.id, companyName: request.companyName, plan: 'STARTER', suggestedSlug: 'test-e2e-demo', trialDays: 15, modules: ['CRM'], duplicateWarnings: [] } }));
  await page.route('**/api/admin/demo-requests/demo-request-1/approve', (route) => { calls.push('approve'); return json(route, { data: { status: 'PROVISIONED' } }); });

  await page.goto('/admin/demo-requests');
  await expect(page.getByText(request.companyName)).toBeVisible();
  await expect(page.getByText('Benzer şirket uyarısı')).toBeVisible();
  await page.getByPlaceholder(/irket, ki/).fill('TEST_E2E');
  await page.getByRole('combobox').selectOption('ALL');
  await expect.poll(() => calls.some((value) => value.includes('search=TEST_E2E') && !value.includes('status='))).toBe(true);
  await page.getByRole('button', { name: /zerime al/ }).click();
  await expect.poll(() => calls.includes('assign')).toBe(true);
  const note = page.getByPlaceholder(/Not veya/);
  await note.fill('TEST_E2E satış görüşmesi');
  await page.getByRole('button', { name: /Not ekle/ }).click();
  await expect.poll(() => calls.some((value) => value.startsWith('note:') && value.includes('TEST_E2E'))).toBe(true);
  await note.fill('TEST_E2E satış görüşmesi');
  await page.getByRole('button', { name: /Provisioning/ }).click();
  await expect(page.getByText(/Slug: test-e2e-demo/)).toBeVisible();
  await expect(page.getByText(/Deneme: 15/)).toBeVisible();
  await page.getByRole('button', { name: /Onayla ve provision et/ }).click();
  await expect.poll(() => calls.includes('approve')).toBe(true);
});

test('rejection requires a reason and submits it', async ({ page }) => {
  let rejection = '';
  await login(page);
  await page.route('**/api/admin/demo-requests?**', (route) => json(route, { data: [request], total: 1, page: 1, limit: 50 }));
  await page.route('**/api/admin/demo-requests/demo-request-1/reject', (route) => { rejection = route.request().postData() ?? ''; return json(route, { data: { status: 'REJECTED' } }); });
  await page.goto('/admin/demo-requests');
  const reject = page.getByRole('button', { name: 'Reddet' });
  await expect(reject).toBeDisabled();
  await page.getByPlaceholder(/Not veya/).fill('Yetersiz red');
  await expect(reject).toBeEnabled();
  await reject.click();
  await expect.poll(() => rejection).toContain('Yetersiz red');
});

test('list error is visible and retry recovers', async ({ page }) => {
  let failing = true;
  await login(page);
  await page.route('**/api/admin/demo-requests?**', (route) => failing
    ? json(route, { error: { code: 'INTERNAL_ERROR', message: 'controlled demo list error' } }, 500)
    : json(route, { data: [request], total: 1, page: 1, limit: 50 }));
  await page.goto('/admin/demo-requests');
  await expect(page.getByText('controlled demo list error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText(request.companyName)).toBeVisible();
});
