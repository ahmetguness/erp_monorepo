import { expect, test } from '@playwright/test';
import { withProductionQuality } from './fixtures/production-quality.fixture';

test('quality rejection persists after reload and approval releases finished goods once', async ({ page }) => {
  await withProductionQuality(page, async ({ db, tenantId, id, productId }) => {
    await page.goto(`/dashboard/production/work-orders/${id}`);
    const panel = page.getByRole('region', { name: 'Kalite kararı' });
    await expect(panel.getByText('Kalite: Onay bekliyor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tamamla', exact: true })).toBeDisabled();
    await panel.getByLabel('Kalite kararı gerekçesi').fill('Yüzey kontrolü başarısız');
    await panel.getByRole('button', { name: 'Kaliteyi reddet' }).click();
    await expect(panel.getByText('Kalite: Reddedildi')).toBeVisible();
    await page.reload();
    await expect(panel.getByText('Kalite: Reddedildi')).toBeVisible();
    expect(await db.stockMovement.count({ where: { tenantId, refId: id } })).toBe(0);
    await panel.getByLabel('Kalite kararı gerekçesi').fill('Yeniden kontrol başarılı');
    await panel.getByRole('button', { name: 'Kaliteyi onayla' }).click();
    await expect(panel.getByText('Kalite: Onaylandı')).toBeVisible();
    await page.getByRole('button', { name: 'Tamamla', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tamamla', exact: true })).toHaveCount(0);
    await page.reload();
    expect((await db.workOrder.findFirstOrThrow({ where: { tenantId, id } })).status).toBe('COMPLETED');
    expect((await db.stockLevel.aggregate({ where: { tenantId, productId }, _sum: { quantity: true } }))._sum.quantity?.toString()).toBe('2');
    expect(await db.stockMovement.count({ where: { tenantId, refId: id, type: 'IN' } })).toBe(1);
  });
});
