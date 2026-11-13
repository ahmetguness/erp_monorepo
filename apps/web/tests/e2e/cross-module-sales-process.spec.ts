import { z } from 'zod';
import { expect, test } from './fixtures/test';
import { withSalesProcess } from './fixtures/sales-process.fixture';

test('real sales workspace reconciles partial delivery, invoice and collection after reload', async ({ page }) => {
  await withSalesProcess(page, async ({ api, db, tenantId, orderId, productId, warehouseId }) => {
    const progress = await api.send('GET', `/api/sales-orders/${orderId}/process-workspace`, z.object({ progress: z.object({ deliveryPercent: z.number(), invoicedPercent: z.number(), collectedPercent: z.number() }) }));
    expect(progress.progress).toEqual({ deliveryPercent: 50, invoicedPercent: 50, collectedPercent: 50 });
    await page.goto(`/dashboard/sales-orders/${orderId}`);
    const workspace = page.getByRole('region', { name: 'Satış iş dosyası' });
    await expect(workspace).toBeVisible();
    await expect(workspace.getByText('%50', { exact: true })).toHaveCount(3);
    await page.reload();
    await expect(workspace.getByText('%50', { exact: true })).toHaveCount(3);
    expect((await db.stockLevel.aggregate({ where: { tenantId, productId, warehouseId }, _sum: { quantity: true } }))._sum.quantity?.toString()).toBe('9');
  });
});
