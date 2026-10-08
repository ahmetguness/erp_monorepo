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

test('API key creation one-time secret and playground navigation work', async ({ page }) => {
  let createCalls = 0;
  const rawKey = 'a'.repeat(64);
  await page.route(/\/api\/api-keys\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    createCalls++;
    const input = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'ui-key', name: input.name, keyPrefix: rawKey.slice(0, 8), scopes: input.scopes, ipAllowlist: input.ipAllowlist ?? [], isActive: true, lastUsedAt: null, expiresAt: null, createdAt: new Date().toISOString(), rawKey } }) });
  });

  await login(page);
  await page.goto('/dashboard/api-keys');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/API Anahtar/);
  await expect(page.getByText(/API Kullan/)).toBeVisible();
  await page.getByRole('button', { name: /Yeni Anahtar/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Anahtar Ad/).fill('TEST_E2E_API_KEYS_UI');
  await dialog.getByRole('button', { name: /m.*Se/ }).click();
  await dialog.locator('textarea').fill('127.0.0.1\n10.0.0.0/24');
  await dialog.getByRole('button', { name: /Olu.*tur/ }).click();
  await expect.poll(() => createCalls).toBe(1);
  await expect(dialog.getByText(rawKey)).toBeVisible();
  await expect(dialog.getByText(/sadece bir kez/)).toBeVisible();
  await dialog.getByRole('button', { name: /Tamam/ }).click();
  await page.getByRole('button', { name: 'Playground' }).click();
  await expect(page.getByText(/API Key/).first()).toBeVisible();
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/dashboard\/api-keys/);
});
