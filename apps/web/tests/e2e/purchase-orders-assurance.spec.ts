import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('purchase orders list, detail, send, export and navigation', async ({ page }) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_PUR_ORDER_UI_${Date.now()}`;
  let productId = '', contactId = '', orderId = '';
  const failures: string[] = [], consoleErrors: string[] = [];
  page.on('requestfailed', (request) => failures.push(`${request.method()} ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`); });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    await page.goto('/login');
    await page.getByLabel('E-posta adresi').fill('admin@axondemo.com');
    await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
    await page.getByRole('button', { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'axon-demo' } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: `${marker}_P`, name: `${marker}_ÜRÜN`, purchasePrice: 25 } }); productId = product.id;
    const supplier = await prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', code: `${marker}_S`, name: `${marker}_TEDARİKÇİ` } }); contactId = supplier.id;
    const setup = await page.evaluate(async ({ productId, contactId, marker }) => {
      const response = await fetch('http://localhost:3001/api/purchase-orders', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId, date: new Date().toISOString(), notes: marker, items: [{ productId, quantity: 2, unitPrice: 25, discount: 10, taxRate: 20 }] }) });
      return { status: response.status, body: await response.json() };
    }, { productId, contactId, marker });
    expect(setup.status).toBe(201); orderId = setup.body.data.id; const number = setup.body.data.number;
    await page.goto('/dashboard/purchase-orders');
    await expect(page.getByRole('heading', { name: 'Satın Alma Siparişleri' })).toBeVisible();
    const onboarding = page.getByRole('button', { name: /Onboarding.*kapat/ });
    await onboarding.waitFor({ state: 'visible', timeout: 2000 }).then(() => onboarding.click()).catch(() => undefined);
    await page.getByPlaceholder(/Sipariş no/).fill(marker);
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await expect(page.getByText(`${marker}_TEDARİKÇİ`, { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Dışa aktar', exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('purchase-orders.csv');
    await page.getByText(number, { exact: true }).click();
    await expect(page.getByRole('heading', { name: new RegExp(number) })).toBeVisible();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await expect(page.getByText('₺54,00', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Gönder', exact: true }).click();
    await page.getByRole('button', { name: 'Gönder', exact: true }).last().click();
    await expect(page.getByText(/Sipariş tedarikçiye gönderildi/)).toBeVisible();
    await expect.poll(async () => (await prisma.purchaseOrder.findUnique({ where: { id: orderId } }))?.status).toBe('SENT');
    await page.reload();
    await expect(page.getByText(/Gönderildi/).first()).toBeVisible();
    await page.getByRole('link', { name: /Listeye dön/ }).click();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.goBack(); await expect(page).toHaveURL(new RegExp(`/purchase-orders/${orderId}`));
    expect(failures.filter((value) => value.includes('/api/purchase-orders'))).toEqual([]);
    expect(consoleErrors.filter((value) => !value.includes('/api/currency-rates/tcmb') && !value.includes('502 (Bad Gateway)'))).toEqual([]);
  } finally {
    if (orderId) await prisma.purchaseOrder.deleteMany({ where: { id: orderId } });
    if (orderId) await prisma.auditLog.deleteMany({ where: { module: 'purchasing', entityId: orderId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (contactId) await prisma.contact.deleteMany({ where: { id: contactId } });
    await prisma.$disconnect();
  }
});
