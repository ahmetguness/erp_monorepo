import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { withSalesProcess } from './fixtures/sales-process.fixture';

test('USD order currency and rate survive invoice form submission and reload', async ({ page }) => {
  await withSalesProcess(page, async ({ api, db, tenantId, orderId, productId }) => {
    const original = await api.send('GET', `/api/sales-orders/${orderId}`, z.object({ contactId: z.string() }));
    const foreignOrderId = await api.create('/api/sales-orders', { contactId: original.contactId, currencyCode: 'USD', exchangeRate: 35.123456,
      date: '2026-11-01', items: [{ productId, quantity: 1, unitPrice: 0.1 }] });
    await page.goto(`/dashboard/invoices/new?salesOrderId=${foreignOrderId}`);
    await expect(page.getByLabel('Para birimi (ISO kodu)')).toHaveValue('USD');
    await expect(page.getByLabel('Kur (1 birim için TRY)')).toHaveValue('35.123456');
    await page.getByRole('button', { name: 'Fatura Oluştur', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-z0-9]+$/);
    const id = page.url().split('/').at(-1);
    if (!id) throw new Error('Invoice ID is missing.');
    const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId, id } });
    expect(invoice.currencyCode).toBe('USD');
    expect(invoice.exchangeRate.toString()).toBe('35.123456');
    expect(invoice.totalGross.toString()).toBe('0.1');
    expect(invoice.salesOrderId).toBe(foreignOrderId);
    await page.reload();
    await expect(page.getByText(/\$0,10|0,10.*\$/).first()).toBeVisible();
  });
});
