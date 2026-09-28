import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('delivery note UI create, read, refresh, lifecycle and export', async ({ page }) => {
  const prisma = new PrismaClient(); const marker = `TEST_E2E_DELIVERY_UI_${Date.now()}`;
  const consoleErrors: string[] = []; const failedRequests: string[] = []; let productId: string | null = null;
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}`));
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'axon-demo' } }); const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: tenant.id } }); const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id } });
    productId = (await prisma.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: marker, name: marker } })).id;
    await page.goto('/login'); await page.getByLabel('E-posta adresi').fill('admin@axondemo.com'); await page.getByLabel('Şifre', { exact: true }).fill('demo1234'); await page.getByRole('button', { name: 'Giriş Yap' }).click(); await expect(page).toHaveURL(/dashboard/); const onboardingClose = page.getByRole('button', { name: "Onboarding'i kapat" }); if (await onboardingClose.isVisible()) await onboardingClose.click();
    await page.goto('/dashboard/delivery-notes'); await expect(page.getByRole('heading', { name: 'İrsaliyeler' })).toBeVisible();
    await page.getByRole('link', { name: 'Yeni irsaliye' }).click(); await expect(page).toHaveURL(/delivery-notes\/new/);
    await page.getByPlaceholder('Depo ara...').fill(warehouse.name); await page.getByRole('button', { name: new RegExp(warehouse.name) }).last().click();
    await page.getByPlaceholder('Ürün ara...').fill(marker); await page.getByRole('button', { name: new RegExp(marker) }).last().click();
    if (await onboardingClose.isVisible()) await onboardingClose.click();
    await page.getByRole('button', { name: 'Kaydet' }).click(); await expect(page).toHaveURL(/dashboard\/delivery-notes$/);
    await page.getByPlaceholder(/İrsaliye no/).fill(marker.slice(-8));
    const created = await prisma.deliveryNote.findFirstOrThrow({ where: { tenantId: tenant.id, items: { some: { productId } } } });
    await page.getByPlaceholder(/İrsaliye no/).fill(created.number); await expect(page.locator('body')).toContainText(created.number);
    await page.reload(); await expect(page.locator('body')).toContainText(created.number);
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Dışa aktar', exact: true }).click(); expect((await download).suggestedFilename()).toBe('irsaliyeler.csv');
    await page.getByText(created.number, { exact: true }).click(); await expect(page.locator('body')).toContainText(marker); await page.getByRole('button', { name: 'Kapat', exact: true }).last().click();
    expect(failedRequests).toEqual([]); expect(consoleErrors).toEqual([]);
  } finally {
    if (productId) { const ids = (await prisma.deliveryNote.findMany({ where: { items: { some: { productId } } }, select: { id: true } })).map(n => n.id); await prisma.deliveryNoteItem.deleteMany({ where: { deliveryNoteId: { in: ids } } }); await prisma.deliveryNote.deleteMany({ where: { id: { in: ids } } }); await prisma.product.deleteMany({ where: { id: productId } }); }
    await prisma.$disconnect();
  }
});
