import { expect, test } from '@playwright/test';

test('security settings handles failure/retry and renders every policy surface', async ({ page }) => {
  const login = await page.request.post('http://localhost:3001/api/auth/login', {
    headers: { origin: 'http://localhost:3000' },
    data: { email: 'admin@axondemo.com', password: 'demo1234', tenantSlug: 'axon-demo' },
  });
  expect(login.status()).toBe(200);

  let failCorporate = true;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.replace(/\/$/, '') === '/api/settings/security/corporate' && route.request().method() === 'GET' && failCorporate) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled security settings error' } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/dashboard/settings/security');
  const alert = page.locator('[role="alert"]').filter({ hasText: 'controlled security settings error' });
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Politikaları Kaydet/ })).toHaveCount(0);

  failCorporate = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(alert).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Kurumsal Güvenlik Politikaları/);
  await expect(page.getByText(/Tekli Oturum Açma/)).toBeVisible();
  await expect(page.getByText(/SCIM 2.0 Kullanıcı Provizyonlama/)).toBeVisible();
  await expect(page.getByText(/IP Adresi Kısıtlamaları/)).toBeVisible();
  await expect(page.getByText(/Oturum Yaşam Döngüsü Politikaları/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Politikaları Kaydet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /SIEM Kaydet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retention Kaydet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dry-run/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Kurumsal Güvenlik Politikaları/);
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/dashboard\/settings\/security/);
});
