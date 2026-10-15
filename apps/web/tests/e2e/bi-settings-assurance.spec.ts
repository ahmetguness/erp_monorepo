import { expect, test } from '@playwright/test';

test('BI settings handles API failure, retry and connector controls', async ({ page }) => {
  const login = await page.request.post('http://localhost:3001/api/auth/login', {
    headers: { origin: 'http://localhost:3000' },
    data: { email: 'admin@axondemo.com', password: 'demo1234', tenantSlug: 'axon-demo' },
  });
  expect(login.status()).toBe(200);

  let fail = true;
  await page.route('**/api/settings/security/bi', async (route) => {
    if (route.request().method() === 'GET' && fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled BI error' } }) });
      return;
    }
    await route.continue();
  });
  await page.goto('/dashboard/settings/bi');
  const alert = page.locator('[role="alert"]').filter({ hasText: /BI ayarlar/ });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('button', { name: /BI Politikalar/ })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/BI Entegrasyonu/);
  await expect(page.getByRole('button', { name: /Eri.*Token.*ret/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /BI Politikalar/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/BI Entegrasyonu/);
});
