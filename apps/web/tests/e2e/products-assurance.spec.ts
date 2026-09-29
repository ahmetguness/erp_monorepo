import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('products UI list, filters, detail, update, refresh, export and soft delete', async ({ page }) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_PRODUCT_UI_${Date.now()}`;
  let productId = '';
  const requestFailures: string[] = [], consoleErrors: string[] = [];
  page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 500) requestFailures.push(`${response.status()} ${response.url()}`); });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    await page.goto('/login');
    await page.getByLabel('E-posta adresi').fill('admin@axondemo.com');
    await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
    await page.getByRole('button', { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'axon-demo' } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const setup = await page.evaluate(async ({ marker, unitId, categoryId }) => {
      const response = await fetch('http://localhost:3001/api/products', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `${marker}_P`, name: `${marker}_Türkçe`, unitId, categoryId, purchasePrice: 100, salesPrice: 150, minStockLevel: 5 }) });
      return { status: response.status, body: await response.json() };
    }, { marker, unitId: unit.id, categoryId: category.id });
    expect(setup.status).toBe(201); productId = setup.body.data.id;

    await page.goto('/dashboard/products');
    await expect(page.getByRole('heading', { name: 'Ürünler' })).toBeVisible();
    const onboarding = page.getByRole('button', { name: /Onboarding.*kapat/ });
    await onboarding.waitFor({ state: 'visible', timeout: 1500 }).then(() => onboarding.click()).catch(() => undefined);
    await page.getByPlaceholder('Kod, ad, barkod ara...').fill(marker);
    await expect(page.getByText(`${marker}_Türkçe`, { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Dışa aktar', exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toContain('ürünler');
    await page.getByText(`${marker}_Türkçe`, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}`));
    await expect(page.getByText(`${marker}_P`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('₺150,00', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
    await page.getByLabel('Ürün Adı').fill(`${marker}_UPDATED`);
    await page.getByLabel('Satış Fiyatı (₺)').fill('175.75');
    await page.getByRole('button', { name: 'Güncelle', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await expect(page.getByText(`${marker}_UPDATED`, { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText('₺175,75', { exact: true }).first()).toBeVisible();
    await expect.poll(async () => Number((await prisma.product.findUnique({ where: { id: productId } }))?.salesPrice)).toBe(175.75);
    expect(consoleErrors.filter((value) => !value.includes('/api/currency-rates/tcmb') && !value.includes('502 (Bad Gateway)'))).toEqual([]);
    await page.getByRole('button', { name: 'Sil', exact: true }).click();
    await page.getByRole('button', { name: 'Sil', exact: true }).last().click();
    await expect(page).toHaveURL(/dashboard\/products$/);
    await expect.poll(async () => Boolean((await prisma.product.findUnique({ where: { id: productId } }))?.deletedAt)).toBe(true);
    expect(requestFailures.filter((value) => value.includes('/api/products'))).toEqual([]);
  } finally {
    if (productId) await prisma.auditLog.deleteMany({ where: { entityId: productId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
});
