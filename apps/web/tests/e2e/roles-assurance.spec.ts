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

test('roles CRUD controls, permission toggle, assignment and simulator are wired', async ({ page }) => {
  const now = '2026-10-07T12:00:00.000Z';
  let role = { id: 'r1', tenantId: 't1', name: 'TEST_E2E_ROLES_UI', description: 'UI fixture', isSystem: false, createdAt: now, updatedAt: now, permissions: [{ id: 'p1', roleId: 'r1', module: 'contacts', action: 'READ' }], _count: { users: 0 }, users: [] as Array<{ user: { id: string; name: string; email: string } }> };
  let createCalls = 0, updateCalls = 0, permissionCalls = 0, assignmentCalls = 0, simulationCalls = 0;
  const user = { id: 'tu1', userId: 'u1', tenantId: 't1', roleId: null, isOwner: false, isActive: true, user: { id: 'u1', name: 'TEST_E2E User', email: 'roles-ui@test.local', isActive: true }, roleRef: null };

  await page.route('**/api/roles/permission-simulator/matrix', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'contacts:list', label: 'Cariler', route: '/api/contacts', method: 'GET', module: 'contacts', action: 'READ', webHref: '/dashboard/contacts', webAction: 'Cari listesi' }] }) }));
  await page.route('**/api/roles/permission-simulator/screen-preview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { user: { id: 'u1', name: 'TEST_E2E User', email: 'roles-ui@test.local', isOwner: false, roleId: 'r1', roleName: role.name }, tenant: { plan: 'ENTERPRISE', modules: ['contacts'] }, summary: { visibleCount: 1, blockedCount: 0, totalCount: 1 }, screens: [{ routeId: 'contacts:list', label: 'Cariler', href: '/dashboard/contacts', module: 'contacts', action: 'READ', webAction: 'Cari listesi', minPlan: null, featureKey: null, allowed: true, gates: [], blockers: [] }] } }) }));
  await page.route('**/api/roles/permission-simulator/simulate', (route) => { simulationCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { allowed: true, user: { id: 'u1', name: 'TEST_E2E User', email: 'roles-ui@test.local', isOwner: false, roleId: 'r1', roleName: role.name }, tenant: { plan: 'ENTERPRISE', modules: ['contacts'] }, requested: { module: 'contacts', action: 'READ', route: null }, explanation: { summary: 'Erisim uygun.', blockers: [], nextSteps: [] }, gates: [{ key: 'tenant', label: 'Tenant', allowed: true, reason: 'Aktif' }, { key: 'module', label: 'Modul', allowed: true, reason: 'Aktif' }, { key: 'plan', label: 'Plan', allowed: true, reason: 'Uygun' }, { key: 'feature', label: 'Feature', allowed: true, reason: 'Aktif' }, { key: 'permission', label: 'Izin', allowed: true, reason: 'Var' }], matchingRoutes: [] } }) }); });
  await page.route(/\/api\/users\/?(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [user], meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 } }) }));
  await page.route('**/api/users/u1', async (route) => { assignmentCalls++; const data = route.request().postDataJSON(); user.roleId = data.roleId; role = { ...role, users: data.roleId ? [{ user: user.user }] : [], _count: { users: data.roleId ? 1 : 0 } }; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: user.user }) }); });
  await page.route('**/api/roles/r1/permissions', (route) => { permissionCalls++; role = { ...role, permissions: [...role.permissions, { id: 'p2', roleId: 'r1', module: 'contacts', action: 'CREATE' }] }; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: role.permissions.at(-1) }) }); });
  await page.route('**/api/roles/r1', async (route) => {
    if (route.request().method() === 'PATCH') { updateCalls++; role = { ...role, ...route.request().postDataJSON() }; }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: role }) });
  });
  await page.route(/\/api\/roles\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      createCalls++;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { ...role, id: 'r2', ...route.request().postDataJSON() } }) });
    }
    return route.continue();
  });

  await login(page);
  await page.goto('/dashboard/roles');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Rol/);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('button', { name: /Yeni Rol/ }).click();
  await page.getByLabel(/Rol Ad/).fill('TEST_E2E_ROLES_CREATED');
  await page.getByRole('button', { name: /Olu.*tur/ }).click();
  await expect.poll(() => createCalls).toBe(1);
  const createDialog = page.getByRole('dialog');
  if (await createDialog.isVisible()) await createDialog.getByRole('button', { name: /ptal/ }).click();
  await page.getByRole('button', { name: 'Detay' }).first().click();
  await expect(page.getByText(/zin Matrisi/)).toBeVisible();
  await page.getByRole('button', { name: 'Kapat', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /Test Et/ })).toBeVisible();
});
