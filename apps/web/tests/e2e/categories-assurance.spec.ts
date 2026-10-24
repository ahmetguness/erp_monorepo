import { expect, test, type Page } from './fixtures/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const close = page.getByRole('button', { name: /Onboarding.*kapat/ });
  await close.waitFor({ state: 'visible', timeout: 1200 }).then(() => close.click()).catch(() => undefined);
}

test('categories real create, refresh, update, detach-capable form and delete', async ({ page }) => {
  await login(page);
  const suffix = Date.now().toString().slice(-6);
  const initial = `TEST_E2E_Kategori_${suffix}`;
  const updated = `${initial}_Güncel`;
  await page.goto('/dashboard/settings/categories');
  await expect(page.getByRole('heading', { name: 'Kategoriler' })).toBeVisible();
  await page.getByRole('button', { name: 'Yeni Kategori' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ad zorunludur')).toBeVisible();
  await page.getByRole('button', { name: 'İptal' }).click();
  await page.getByRole('button', { name: 'Yeni Kategori' }).click();
  await page.getByRole('textbox', { name: 'Ad*', exact: true }).fill(initial);
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  const row = page.getByText(initial, { exact: true }).locator('..');
  await row.getByRole('button', { name: 'Düzenle' }).click({ force: true });
  await expect(page.getByText('Kategori görseli', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Ad*', exact: true }).fill(updated);
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(updated, { exact: true })).toBeVisible();
  await page.getByText(updated, { exact: true }).locator('..').getByRole('button', { name: 'Sil' }).click({ force: true });
  await expect(page.getByText(/kategorisini silmek istediğinize emin misiniz/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Evet, devam et' }).click();
  await expect(page.getByText(updated, { exact: true })).not.toBeVisible();
});

test('categories API error is explicit and retry recovers to empty state', async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route('**/api/master/categories', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled categories error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.goto('/dashboard/settings/categories');
  await expect(page.getByText('controlled categories error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('Henüz kategori eklenmemiş')).toBeVisible();
});
