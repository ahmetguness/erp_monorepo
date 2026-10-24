import { expect, test, type Page } from './fixtures/test';
import { PrismaClient } from '@prisma/client';

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
  const response = await page.request.get('http://localhost:3001/api/master/currencies');
  expect(response.ok()).toBe(true);
  const existing = await response.json();
  const usedCodes = new Set<string>(existing.data.map((currency: { code: string }) => currency.code));
  const code = Array.from({ length: 676 }, (_, index) => `Q${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`)
    .find((candidate) => !usedCodes.has(candidate));
  if (!code) throw new Error('No unused test currency code remains.');
  const prisma = new PrismaClient();
  let created: { id: string; tenantId: string } | undefined;
  try {
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
  await page.getByRole('textbox', { name: 'Kod*', exact: true }).fill(code.toLowerCase());
  await page.getByRole('spinbutton', { name: 'Varsayılan Kur*', exact: true }).fill('12.3456');
  const createdResponse = page.waitForResponse((result) => result.url().endsWith('/api/master/currencies') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  const saved = await createdResponse;
  expect(saved.status()).toBe(201);
  created = (await saved.json()).data;
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText(code);
  await expect(row).toContainText('12.3456');
  await expect(row).toContainText('Döviz');
  await page.reload();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  } finally {
    if (created) await prisma.currency.deleteMany({ where: { id: created.id, tenantId: created.tenantId, name } });
    await prisma.$disconnect();
  }
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
