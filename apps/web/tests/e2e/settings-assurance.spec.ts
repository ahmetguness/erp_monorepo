import { expect, test, type Page } from './fixtures/test';

let cachedSessionCookie: { name: string; value: string } | null = null;

async function login(page: Page) {
  if (cachedSessionCookie) {
    await page.context().addCookies([{ ...cachedSessionCookie, domain: 'localhost', path: '/' }]);
  } else {
    const response = await page.request.post('http://localhost:3001/api/auth/login', {
      headers: { origin: 'http://localhost:3000' },
      data: { email: 'admin@axondemo.com', password: 'demo1234', tenantSlug: 'axon-demo' },
    });
    expect(response.status()).toBe(200);
    const pair = response.headers()['set-cookie']?.split(';')[0]?.split('=');
    expect(pair?.length).toBeGreaterThanOrEqual(2);
    cachedSessionCookie = { name: pair![0], value: pair!.slice(1).join('=') };
  }
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/dashboard/);
  const close = page.getByRole('button', { name: /Onboarding.*kapat/ });
  await close.waitFor({ state: 'visible', timeout: 5000 }).then(() => close.click()).catch(() => undefined);
}

async function dismissOnboarding(page: Page) {
  const close = page.getByRole('button', { name: /Onboarding.*kapat/ });
  await close.waitFor({ state: 'visible', timeout: 5000 }).then(() => close.click()).catch(() => undefined);
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

test('general settings exposes API failure and retries successfully', async ({ page }) => {
  test.setTimeout(120_000);
  // The preceding navigation matrix intentionally visits every settings page and can
  // consume most of the production 60-second global API allowance. Preserve the real
  // limiter and wait for its fixed window instead of weakening it for E2E.
  await page.waitForTimeout(61_000);
  let failTenantSettings = true;
  let interceptedRequests = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.replace(/\/$/, '') === '/api/settings' && route.request().method() === 'GET' && failTenantSettings) {
      interceptedRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled general settings error' } }),
      });
      return;
    }
    await route.continue();
  });
  await login(page);

  await page.goto('/dashboard/settings/general');
  await dismissOnboarding(page);
  const errorAlert = page.locator('[role="alert"]').filter({ hasText: 'controlled general settings error' });
  await expect.poll(() => interceptedRequests, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(errorAlert).toBeVisible({ timeout: 20_000 });
  failTenantSettings = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(errorAlert).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Genel Ayarlar/);
});

test('general settings creates and persists an isolated browser fixture', async ({ page }) => {
  const key = `TEST_E2E_GENERAL_BROWSER_${Date.now()}`;
  const value = 'TÃ¼rkÃ§e, quoted "value"';
  await login(page);

  try {
    await page.goto('/dashboard/settings/general');
    await dismissOnboarding(page);
    await page.getByRole('button', { name: /Yeni Ayar/ }).click();
    await page.getByRole('textbox', { name: 'Anahtar', exact: true }).fill(key);
    await page.getByRole('textbox', { name: /De.er/, exact: true }).fill(value);
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText(value, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText(value, { exact: true })).toBeVisible();
    const response = await page.request.get('http://localhost:3001/api/settings', { headers: { origin: 'http://localhost:3000' } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(expect.arrayContaining([expect.objectContaining({ key, value })]));
  } finally {
    const cleanup = await page.request.delete(`http://localhost:3001/api/settings/${encodeURIComponent(key)}`, { headers: { origin: 'http://localhost:3000' } });
    expect(cleanup.status()).toBe(200);
    const afterCleanup = await page.request.get('http://localhost:3001/api/settings', { headers: { origin: 'http://localhost:3000' } });
    expect(afterCleanup.status()).toBe(200);
    const cleanupBody = await afterCleanup.json();
    expect(cleanupBody.data.some((item: { key: string }) => item.key === key)).toBe(false);
  }
});
