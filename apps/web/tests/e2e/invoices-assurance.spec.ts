import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('invoice UI create, read, totals, export and reasoned cancellation', async ({ page }) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_INVOICE_UI_${Date.now()}`;
  const consoleErrors: string[] = []; const failedRequests: string[] = [];
  let contactId: string | null = null;
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', r => failedRequests.push(`${r.method()} ${r.url()}`));
  try {
    await page.goto('/login');
    await page.getByLabel('E-posta adresi').fill('admin@axondemo.com');
    await page.getByLabel('Şifre', { exact: true }).fill('demo1234');
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const setup = await page.evaluate(async name => { const response = await fetch('http://localhost:3001/api/contacts', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'CUSTOMER', name, code: name }) }); return { status: response.status, body: await response.json() }; }, marker);
    expect(setup.status).toBe(201); contactId = setup.body.data.id;
    await page.goto('/dashboard/invoices');
    await expect(page.getByRole('heading', { name: 'Faturalar' })).toBeVisible();
    await page.getByRole('button', { name: 'Hızlı Fatura' }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/new/);
    const contactInput = page.getByPlaceholder('Cari ara...'); await contactInput.fill(marker); await page.getByRole('button', { name: new RegExp(marker) }).click();
    await page.getByPlaceholder('Ürün / hizmet açıklaması').fill('TEST_E2E Türkçe hizmet');
    const numbers = page.locator('input[type="number"]'); await numbers.nth(0).fill('2'); await numbers.nth(1).fill('1000');
    await expect(page.locator('body')).toContainText('2.000,00');
    await page.getByRole('button', { name: 'Fatura Oluştur' }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-z0-9]+$/);
    await expect(page.locator('body')).toContainText('TEST_E2E Türkçe hizmet'); await expect(page.locator('body')).toContainText('2.000,00');
    const detailUrl = page.url(); await page.reload(); await expect(page.locator('body')).toContainText('2.000,00');
    await page.getByRole('button', { name: 'İptal et' }).click();
    await page.getByPlaceholder('İptal nedenini yazın').fill('TEST_E2E müşteri talebi');
    await page.getByRole('button', { name: 'Evet, iptal et' }).click();
    await expect(page.locator('body')).toContainText('İptal');
    const id = detailUrl.split('/').pop()!; assertNonEmpty(id);
    const db = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { history: true } });
    expect(db.status).toBe('CANCELLED'); expect(db.history.some(h => h.notes?.includes('TEST_E2E müşteri talebi'))).toBeTruthy();
    await page.goto('/dashboard/invoices'); await page.getByPlaceholder(/Fatura no veya cari/).fill(marker); await expect(page.locator('body')).toContainText(marker);
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Dışa aktar', exact: true }).click(); expect((await downloadPromise).suggestedFilename()).toMatch(/\.csv$/);
    expect(failedRequests).toEqual([]); expect(consoleErrors).toEqual([]);
  } finally {
    if (contactId) { const ids = (await prisma.invoice.findMany({ where: { contactId }, select: { id: true } })).map(x => x.id); if (ids.length) { await prisma.invoiceHistory.deleteMany({ where: { invoiceId: { in: ids } } }); await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } }); await prisma.invoice.deleteMany({ where: { id: { in: ids } } }); } await prisma.contact.deleteMany({ where: { id: contactId } }); }
    await prisma.$disconnect();
  }
});

function assertNonEmpty(value: string): asserts value is string { expect(value.length).toBeGreaterThan(0); }
