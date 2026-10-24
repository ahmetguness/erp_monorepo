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

test('units validation, real create and delete flow', async ({ page }) => {
  await login(page);
  const suffix = Date.now().toString().slice(-6);
  const name = `TEST_E2E_Birim_${suffix}`;
  const code = `T${suffix}`;
  await page.goto('/dashboard/settings/units');
  await expect(page.getByRole('heading', { name: 'Birimler' })).toBeVisible();
  await page.getByRole('button', { name: 'Yeni Birim' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ad zorunludur')).toBeVisible();
  await expect(page.getByText('Kod zorunludur')).toBeVisible();
  await page.getByRole('button', { name: 'İptal' }).click();
  await page.getByRole('button', { name: 'Yeni Birim' }).click();
  await page.getByRole('textbox', { name: 'Ad*', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'Kod*', exact: true }).fill(code);
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole('row', { name: new RegExp(`${code} ${name}`) }).getByRole('button', { name: 'Sil' }).click({ force: true });
  await expect(page.getByText(/birimini silmek istediğinize emin misiniz/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Evet, devam et' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`${code} ${name}`) })).not.toBeVisible();
});

test('units API error is explicit and retry recovers', async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route('**/api/master/units', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled units error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.goto('/dashboard/settings/units');
  await expect(page.getByText('controlled units error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('Henüz birim eklenmemiş')).toBeVisible();
});
