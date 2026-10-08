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

const settingsLinks = [
  '/dashboard/settings/users',
  '/dashboard/settings/units',
  '/dashboard/settings/categories',
  '/dashboard/settings/tax-rates',
  '/dashboard/settings/currencies',
  '/dashboard/tickets',
  '/dashboard/settings/support-access',
  '/dashboard/settings/general',
  '/dashboard/settings/security',
  '/dashboard/settings/bi',
  '/dashboard/settings/audit-log',
  '/dashboard/settings/domain-events',
  '/dashboard/settings/portal',
] as const;

test('settings hub renders every supported navigation target', async ({ page }) => {
  const failedSettingsRequests: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/settings') && response.status() >= 400) {
      failedSettingsRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  await login(page);
  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Ayarlar/);
  await expect(page.getByText('Ekip', { exact: true })).toBeVisible();
  await expect(page.getByText('Referans Verileri', { exact: true })).toBeVisible();
  await expect(page.getByText('Sistem', { exact: true })).toBeVisible();
  for (const href of settingsLinks) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  await page.locator('a[href="/dashboard/settings/general"]').last().click();
  await expect(page).toHaveURL(/dashboard\/settings\/general/);
  await page.goBack();
  await expect(page).toHaveURL(/dashboard\/settings$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Ayarlar/);
  expect(failedSettingsRequests).toEqual([]);
});

test('settings hub handles checklist API failure without losing navigation', async ({ page }) => {
  let failing = true;
  await page.route('**/api/settings/setup-checklist', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled settings error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: { summary: { completed: 0, total: 0, remaining: 0, percent: 100 }, items: [] } }) }));
  await login(page);
  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Ayarlar/);
  await expect(page.getByText('controlled settings error')).toBeVisible();
  await expect(page.locator('a[href="/dashboard/settings/general"]')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('controlled settings error')).not.toBeVisible();
});

test('every settings destination resolves as an authenticated page', async ({ page }) => {
  await login(page);
  for (const href of settingsLinks) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(href.replaceAll('/', '\\/')));
    await expect(page.locator('body')).not.toContainText('404');
  }
});
