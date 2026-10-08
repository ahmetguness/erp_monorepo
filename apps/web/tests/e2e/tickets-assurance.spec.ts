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

const ticket = { id: 'ticket-1', ticketNumber: 'TCK-2026-123456-1234', createdById: 'user-1', createdByUser: { id: 'user-1', name: 'Test User', email: 'test@example.test' }, title: 'TEST_E2E Ticket Türkçe', description: 'Deterministik destek açıklaması.', category: 'TECHNICAL', priority: 'HIGH', status: 'OPEN', assignedAdminId: null, assignedAdmin: null, resolvedAt: null, closedAt: null, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z', messageCount: 1, lastMessageAt: '2026-10-08T00:00:00.000Z' };

test('ticket list supports filters, create modal, refresh and navigation', async ({ page }) => {
  const requests: string[] = [];
  let rows = [ticket];
  await page.route('**/api/support-tickets**', async (route) => {
    requests.push(route.request().url());
    if (route.request().method() === 'POST' && /\/api\/support-tickets$/.test(new URL(route.request().url()).pathname)) {
      const input = route.request().postDataJSON();
      rows = [{ ...ticket, id: 'ticket-2', ticketNumber: 'TCK-2026-654321-4321', title: input.title, description: input.description, category: input.category, priority: input.priority }, ...rows];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { ...rows[0], tenantName: 'Test', tenantSlug: 'test', messages: [] } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: rows }) });
  });
  await login(page);
  await page.goto('/dashboard/tickets');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Destek/);
  await expect(page.getByText('TEST_E2E Ticket Türkçe')).toBeVisible();
  await page.getByPlaceholder(/Bilet no/).fill('TEST_E2E');
  await expect.poll(() => requests.some((url) => url.includes('search=TEST_E2E'))).toBe(true);
  await page.getByRole('combobox').selectOption('TECHNICAL');
  await expect.poll(() => requests.some((url) => url.includes('category=TECHNICAL'))).toBe(true);
  await page.getByRole('button', { name: /Temizle/ }).click();
  await expect(page.getByPlaceholder(/Bilet no/)).toHaveValue('');
  await page.getByRole('button', { name: /Yeni Destek Talebi/ }).click();
  await page.getByLabel(/Konu/).fill('TEST_E2E Yeni Talep');
  await page.getByLabel(/Detayl/).fill('TEST_E2E ayrıntılı destek talebi açıklaması.');
  await page.getByRole('button', { name: /Acil/ }).click();
  await page.getByRole('button', { name: /Talebi G/ }).click();
  await expect(page.getByText('TEST_E2E Yeni Talep')).toBeVisible();
  await page.reload();
  await expect(page.getByText('TEST_E2E Ticket Türkçe')).toBeVisible();
  await page.getByText('TEST_E2E Ticket Türkçe').click();
  await expect(page).toHaveURL(/dashboard\/tickets\/ticket-1/);
});

test('ticket list exposes API error and recovers on retry', async ({ page }) => {
  let failing = true;
  await page.route('**/api/support-tickets**', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled ticket error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [ticket] }) }));
  await login(page);
  await page.goto('/dashboard/tickets');
  await expect(page.getByText('controlled ticket error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('TEST_E2E Ticket Türkçe')).toBeVisible();
});
