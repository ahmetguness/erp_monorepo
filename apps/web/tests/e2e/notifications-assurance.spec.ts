import { expect, test, type Page } from '@playwright/test';

let activeTenantId = '';
let activeUserId = '';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const payload = await page.evaluate(async () => {
    const response = await fetch('http://localhost:3001/api/auth/me', { credentials: 'include' });
    return response.json();
  });
  activeTenantId = payload.data.tenant.id;
  activeUserId = payload.data.user.id;
}

const notification = { id: 'notification-1', tenantId: 'tenant-1', userId: 'user-1', title: 'TEST_E2E Bildirim Türkçe', message: 'Kontrollü bildirim mesajı', module: 'inventory', entityType: null, entityId: null, status: 'UNREAD', createdAt: '2026-10-08T08:00:00.000Z', readAt: null };
const attention = { preferences: { quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'Europe/Istanbul' }, digest: { cadence: 'OFF', hour: 9, weekday: 1 }, channels: { inApp: true, email: false }, mutedModules: [], escalation: { enabled: false, afterHours: 24, targetRoleId: null } }, quietHoursActive: false, focusSmartIds: [], groupedSystemNotifications: [], digestCount: 0, suppressedCount: 0, nextDigestAt: null, metrics: { impressions: 0, actions: 0, dismissals: 0, digestOpens: 0 } };

async function mockSupportingRoutes(page: Page) {
  await page.route('**/api/notifications/smart', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [], totalCount: 0, criticalCount: 0, highCount: 0, mediumCount: 0 } }) }));
  await page.route('**/api/notifications/attention', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attention }) }));
}

test('notifications page searches, marks read, archives, deletes and refreshes', async ({ page }) => {
  let row: typeof notification | null = notification;
  await page.route('**/api/notifications**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/read')) row = row ? { ...row, status: 'READ', readAt: new Date().toISOString() } : row;
    if (path.endsWith('/archive')) row = row ? { ...row, status: 'ARCHIVED' } : row;
    if (route.request().method() === 'DELETE') { row = null; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true } }) }); }
    if (route.request().method() === 'POST' && row) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...row, tenantId: activeTenantId, userId: activeUserId } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: row ? [{ ...row, tenantId: activeTenantId, userId: activeUserId }] : [], meta: { unreadCount: row?.status === 'UNREAD' ? 1 : 0 } }) });
  });
  await mockSupportingRoutes(page);
  await login(page);
  await page.goto('/dashboard/notifications');
  await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
  await expect(page.getByText(notification.title)).toBeVisible();
  await page.getByPlaceholder('Bildirim ara...').fill('bulunmayan');
  await expect(page.getByText(notification.title)).toBeHidden();
  await page.getByPlaceholder('Bildirim ara...').fill('TEST_E2E');
  await page.getByTitle('Okundu İşaretle').click();
  await expect.poll(() => row?.status).toBe('READ');
  await page.getByTitle('Arşivle').click();
  await expect.poll(() => row?.status).toBe('ARCHIVED');
  await page.getByTitle('Sil').click();
  await expect.poll(() => row).toBeNull();
});

test('notifications page exposes API error and recovers', async ({ page }) => {
  let failing = true;
  await page.route('**/api/notifications**', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled notifications error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ ...notification, tenantId: activeTenantId, userId: activeUserId }], meta: { unreadCount: 1 } }) }));
  await mockSupportingRoutes(page);
  await login(page);
  await page.goto('/dashboard/notifications');
  await expect(page.getByText('controlled notifications error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText(notification.title)).toBeVisible();
});
