import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('manual movement, filters, totals, refresh and product navigation', async ({ page }) => {
  const prisma = new PrismaClient(); const marker = `TEST_E2E_MOVEMENT_UI_${Date.now()}`;
  let productId = '', warehouseId = ''; const failures: string[] = [], errors: string[] = [];
  page.on('requestfailed', r => failures.push(r.url())); page.on('response', r => { if (r.status() >= 500) failures.push(`${r.status()} ${r.url()}`); }); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'axon-demo' } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const warehouse = await prisma.warehouse.create({ data: { tenantId: tenant.id, code: `${marker}_W`, name: `${marker} Depo` } }); warehouseId = warehouse.id;
    const product = await prisma.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: `${marker}_P`, name: `${marker} Ürün` } }); productId = product.id;
    await page.goto('/login'); await page.getByLabel(/E-posta/).fill('admin@axondemo.com'); await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234'); await page.getByRole('button', { name: /Giri.*Yap/ }).click(); await expect(page).toHaveURL(/dashboard/);
    await page.goto('/dashboard/stock/movements'); await expect(page.getByRole('heading', { level: 1, name: /Stok Hareketleri/ })).toBeVisible();
    await page.getByRole('button', { name: /Manuel Hareket/ }).first().click(); const dialog = page.getByRole('dialog');
    const boxes = dialog.locator('input[type="text"]'); await boxes.nth(0).fill(marker); await dialog.getByRole('button', { name: new RegExp(`${marker}_P`) }).click();
    await boxes.nth(1).fill(marker); await dialog.getByRole('button', { name: new RegExp(`${marker}_W`) }).click();
    await dialog.getByLabel('Miktar').fill('5.5'); await dialog.getByLabel(/Birim Maliyet/).fill('12.25'); await dialog.getByLabel('Notlar').fill('Türkçe hareket ÇĞİÖŞÜ'); await dialog.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByLabel(/Ürün ara|ÃœrÃ¼n ara/).fill(marker); const row = page.getByRole('row').filter({ hasText: `${marker} Ürün` }); await expect(row).toContainText(/5[,.]5/); await expect(row).toContainText(/Giriş|GiriÅŸ/);
    await page.reload(); await page.getByLabel(/Ürün ara|ÃœrÃ¼n ara/).fill(marker); await expect(row).toBeVisible();
    await page.getByLabel('Hareket tipi').selectOption('OUT'); await expect(page.getByText(/Filtrelerle eşleşen|Filtrelerle eÅŸleÅŸen/)).toBeVisible(); await page.getByRole('button', { name: /Temizle/ }).first().click();
    await page.getByLabel(/Ürün ara|ÃœrÃ¼n ara/).fill(marker); await row.getByRole('button').click(); await expect(page).toHaveURL(new RegExp(`/dashboard/products/${productId}$`)); await page.goBack(); await expect(page).toHaveURL(/stock\/movements/);
    expect(failures.filter(x => x.includes('/api/stock'))).toEqual([]); expect(errors.filter(x => !x.includes('currency-rates'))).toEqual([]);
    expect(await prisma.stockMovement.count({ where: { productId } })).toBe(1); expect(Number((await prisma.stockLevel.findFirstOrThrow({ where: { productId } })).quantity)).toBe(5.5);
  } finally {
    const moves = await prisma.stockMovement.findMany({ where: { productId }, select: { id: true } }); await prisma.stockValuation.deleteMany({ where: { movementId: { in: moves.map(x => x.id) } } }); await prisma.stockMovement.deleteMany({ where: { productId } }); await prisma.stockLevel.deleteMany({ where: { productId } }); if (productId) await prisma.product.deleteMany({ where: { id: productId } }); if (warehouseId) { await prisma.location.deleteMany({ where: { warehouseId } }); await prisma.warehouse.deleteMany({ where: { id: warehouseId } }); } await prisma.$disconnect();
  }
});
