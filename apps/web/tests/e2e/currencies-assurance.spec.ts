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

test('currencies real create, normalization, decimal display and refresh persistence', async ({ page }) => {
  await login(page);
  const name = `TEST_E2E_Para_Birimi_${Date.now().toString().slice(-6)}`;
  await page.goto('/dashboard/settings/currencies');
  await expect(page.getByRole('heading', { name: 'Para Birimleri' })).toBeVisible();
  await page.getByRole('button', { name: 'Yeni Para Birimi' }).click();
  await page.getByRole('textbox', { name: 'Kod*', exact: true }).fill('AB');
  await page.getByRole('textbox', { name: 'Sembol*', exact: true }).fill('¤');
  await page.getByRole('textbox', { name: 'Ad*', exact: true }).fill(name);
  await page.getByRole('spinbutton', { name: 'Varsayılan Kur*', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Kod üç harf olmalıdır')).toBeVisible();
  await expect(page.getByText('Geçerli bir kur girin')).toBeVisible();
  await page.getByRole('textbox', { name: 'Kod*', exact: true }).fill('qxz');
  await page.getByRole('spinbutton', { name: 'Varsayılan Kur*', exact: true }).fill('12.3456');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('QXZ');
  await expect(row).toContainText('12.3456');
  await expect(row).toContainText('Döviz');
  await page.reload();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
});

test('currencies API error is explicit and retry recovers', async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route('**/api/master/currencies', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled currencies error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.goto('/dashboard/settings/currencies');
  await expect(page.getByText('controlled currencies error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('Henüz para birimi eklenmemiş')).toBeVisible();
});
