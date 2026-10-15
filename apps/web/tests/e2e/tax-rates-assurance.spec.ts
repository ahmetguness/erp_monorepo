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

test('tax rates real create, refresh, decimal update and withholding toggle', async ({ page }) => {
  await login(page);
  const suffix = Date.now().toString().slice(-6);
  const initial = `TEST_E2E_Vergi_${suffix}`;
  const updated = `${initial}_Güncel`;
  await page.goto('/dashboard/settings/tax-rates');
  await expect(page.getByRole('heading', { name: 'Vergi Oranları' })).toBeVisible();
  await page.getByRole('button', { name: 'Yeni Oran' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ad zorunludur')).toBeVisible();
  await expect(page.getByText('Oran zorunludur')).toBeVisible();
  await page.getByRole('button', { name: 'İptal' }).click();
  await page.getByRole('button', { name: 'Yeni Oran' }).click();
  await page.getByRole('textbox', { name: 'Ad*', exact: true }).fill(initial);
  await page.getByRole('spinbutton', { name: 'Oran (%)*', exact: true }).fill('18.50');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await page.reload();
  const row = page.getByRole('row', { name: new RegExp(initial) });
  await expect(row).toContainText('%18.5');
  await row.getByRole('button', { name: 'Düzenle' }).click({ force: true });
  await page.getByRole('textbox', { name: 'Ad*', exact: true }).fill(updated);
  await page.getByRole('spinbutton', { name: 'Oran (%)*', exact: true }).fill('2.25');
  await page.getByRole('checkbox', { name: /Tevkifat/ }).check();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  const updatedRow = page.getByRole('row', { name: new RegExp(updated) });
  await expect(updatedRow).toContainText('%2.25');
  await expect(updatedRow).toContainText('Stopaj / Tevkifat');
});

test('tax rates API error is explicit and retry recovers', async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route('**/api/master/tax-rates', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled tax error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.goto('/dashboard/settings/tax-rates');
  await expect(page.getByText('controlled tax error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('Henüz vergi veya stopaj oranı eklenmemiş')).toBeVisible();
});
