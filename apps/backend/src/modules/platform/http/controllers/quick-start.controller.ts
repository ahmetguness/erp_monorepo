import type { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { SetupChecklistService } from '../../../../services/setup-checklist.service.js';
import { requireTenantId } from '../../../../utils/context.js';
import { adaptiveOnboardingSchema } from '../../application/onboarding/index.js';
import { AdaptiveOnboardingService } from '../../infrastructure/persistence/adaptive-onboarding.service.js';

export { adaptiveOnboardingSchema };

export const QuickStartController = {
  async checklist(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const status = await new SetupChecklistService(prisma).status(tenantId);
    return c.json({ data: status });
  },

  async setup(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const input = getValidatedBody(c, adaptiveOnboardingSchema);
    const result = await new AdaptiveOnboardingService(prisma).complete(tenantId, input);
    return c.json({ success: true, data: result });
  },

  async cleanDemoData(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    await prisma.$transaction(async (tx) => {
      await tx.eDocument.deleteMany({ where: { tenantId } });
      await tx.invoiceLine.deleteMany({ where: { tenantId } });
      await tx.invoiceHistory.deleteMany({ where: { tenantId } });
      await tx.invoice.deleteMany({ where: { tenantId } });
      await tx.paymentAllocation.deleteMany({ where: { tenantId } });
      await tx.payment.deleteMany({ where: { tenantId } });
      await tx.accountEntry.deleteMany({ where: { tenantId } });
      await tx.stockMovement.deleteMany({ where: { tenantId } });
      await tx.stockCountItem.deleteMany({ where: { tenantId } });
      await tx.stockCount.deleteMany({ where: { tenantId } });
      await tx.collectionReminder.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.numberSequence.updateMany({ where: { tenantId, module: { notIn: ['invoice', 'INVOICE'] } }, data: { lastNum: 0 } });
      await tx.numberSequence.deleteMany({ where: { tenantId, module: { in: ['invoice', 'INVOICE'] } } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      await tx.unit.deleteMany({ where: { tenantId } });
      await tx.warehouse.deleteMany({ where: { tenantId } });
      await tx.tenantSetting.deleteMany({
        where: {
          tenantId,
          OR: [
            { key: { in: ['wizard_completed', 'invoice_prefix'] } },
            { key: { startsWith: 'onboarding.' } },
          ],
        },
      });
    });

    return c.json({ success: true, message: 'Demo verileri temizlendi ve başlangıç sihirbazı yeniden etkinleştirildi.' });
  },
};
