import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';
import { SetupChecklistService } from '../services/setup-checklist.service.js';

interface QuickStartDTO {
  companyName: string;
  taxNumber?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
  warehouseName: string;
  currencyCode: string; // e.g. "TRY"
  firstProductCode: string;
  firstProductName: string;
  firstProductPrice: number;
  firstProductTaxRate: number; // e.g. 20
  firstContactName: string;
  firstContactCode: string;
  firstContactType: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  firstContactEmail?: string;
  firstContactPhone?: string;
}

export const QuickStartController = {
  async checklist(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const service = new SetupChecklistService(prisma);
    const status = await service.status(tenantId);
    return c.json({ data: status });
  },

  async setup(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<QuickStartDTO>();
    const optionalText = (value?: string) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };
    const taxNumber = optionalText(body.taxNumber);
    const taxOffice = optionalText(body.taxOffice);
    const address = optionalText(body.address);
    const city = optionalText(body.city);

    if (!body.companyName?.trim() || !taxOffice || !taxNumber || !address || !city || !body.warehouseName?.trim() || !body.currencyCode?.trim() || !body.firstProductCode?.trim() || !body.firstProductName?.trim() || !body.firstContactName?.trim() || !body.firstContactCode?.trim()) {
      throw new ValidationError('Şirket adı, vergi bilgileri, adres, şehir, depo adı, para birimi, ürün bilgileri ve cari bilgileri zorunludur.', {
        ...(!body.companyName?.trim() && { companyName: 'Şirket adı zorunludur.' }),
        ...(!taxOffice && { taxOffice: 'Vergi dairesi zorunludur.' }),
        ...(!taxNumber && { taxNumber: 'Vergi numarası zorunludur.' }),
        ...(!address && { address: 'Adres zorunludur.' }),
        ...(!city && { city: 'Şehir zorunludur.' }),
        ...(!body.warehouseName?.trim() && { warehouseName: 'Depo adı zorunludur.' }),
        ...(!body.currencyCode?.trim() && { currencyCode: 'Para birimi zorunludur.' }),
        ...(!body.firstProductCode?.trim() && { firstProductCode: 'Ürün kodu zorunludur.' }),
        ...(!body.firstProductName?.trim() && { firstProductName: 'Ürün adı zorunludur.' }),
        ...(!body.firstContactCode?.trim() && { firstContactCode: 'Cari kodu zorunludur.' }),
        ...(!body.firstContactName?.trim() && { firstContactName: 'Cari adı zorunludur.' }),
      });
    }

    if (taxNumber) {
      const existingTenant = await prisma.tenant.findFirst({
        where: { taxNumber, id: { not: tenantId } },
        select: { companyName: true },
      });
      if (existingTenant) {
        throw new ValidationError('Bu vergi numarası başka bir firma tarafından kullanılıyor.', {
          taxNumber: `"${taxNumber}" vergi numarası zaten kullanımda.`,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Tenant Info
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          companyName: body.companyName.trim(),
          taxNumber,
          taxOffice,
          address,
          city,
        },
      });

      // 2. Base Currency
      const currency = await tx.currency.upsert({
        where: { tenantId_code: { tenantId, code: body.currencyCode } },
        create: {
          tenantId,
          code: body.currencyCode,
          name: body.currencyCode === 'TRY' ? 'Türk Lirası' : body.currencyCode,
          symbol: body.currencyCode === 'TRY' ? '₺' : '$',
          defaultRate: 1.0,
          isBase: true,
        },
        update: {
          isBase: true,
        },
      });

      // Seed standard tax rates if they do not exist
      const kdvRates = [
        { name: 'KDV %20', rate: 20 },
        { name: 'KDV %10', rate: 10 },
        { name: 'KDV %1', rate: 1 },
      ];

      for (const item of kdvRates) {
        const exists = await tx.taxRate.findFirst({
          where: { tenantId, name: item.name },
        });
        if (!exists) {
          await tx.taxRate.create({
            data: { tenantId, name: item.name, rate: item.rate, isWithholding: false },
          });
        }
      }

      // First product tax rate
      let firstTaxRateId: string | null = null;
      const targetRateName = `KDV %${body.firstProductTaxRate}`;
      let firstTaxRate = await tx.taxRate.findFirst({
        where: { tenantId, rate: body.firstProductTaxRate, isWithholding: false },
      });
      if (!firstTaxRate) {
        firstTaxRate = await tx.taxRate.create({
          data: { tenantId, name: targetRateName, rate: body.firstProductTaxRate, isWithholding: false },
        });
      }
      firstTaxRateId = firstTaxRate.id;

      // 3. Warehouse Setup
      let warehouse = await tx.warehouse.findFirst({
        where: { tenantId },
      });
      if (warehouse) {
        warehouse = await tx.warehouse.update({
          where: { id: warehouse.id },
          data: { name: body.warehouseName },
        });
      } else {
        warehouse = await tx.warehouse.create({
          data: { tenantId, name: body.warehouseName, code: 'WH-01', isActive: true },
        });
      }

      // 4. Default Unit (Adet)
      let unit = await tx.unit.findFirst({ where: { tenantId, code: 'AD' } });
      if (!unit) {
        unit = await tx.unit.create({
          data: { tenantId, name: 'Adet', code: 'AD' },
        });
      }

      // 5. First Product
      const product = await tx.product.upsert({
        where: { tenantId_code: { tenantId, code: body.firstProductCode.trim() } },
        create: {
          tenantId,
          code: body.firstProductCode.trim(),
          name: body.firstProductName.trim(),
          salesPrice: body.firstProductPrice,
          purchasePrice: body.firstProductPrice * 0.7,
          unitId: unit.id,
          taxRateId: firstTaxRateId,
          costingMethod: 'MOVING_AVERAGE',
          isActive: true,
        },
        update: {
          name: body.firstProductName.trim(),
          salesPrice: body.firstProductPrice,
          purchasePrice: body.firstProductPrice * 0.7,
          unitId: unit.id,
          taxRateId: firstTaxRateId,
          costingMethod: 'MOVING_AVERAGE',
          isActive: true,
          deletedAt: null,
        },
      });

      // 6. First Contact
      const contact = await tx.contact.upsert({
        where: { tenantId_code: { tenantId, code: body.firstContactCode.trim() } },
        create: {
          tenantId,
          code: body.firstContactCode.trim(),
          name: body.firstContactName.trim(),
          type: body.firstContactType,
          email: optionalText(body.firstContactEmail),
          phone: optionalText(body.firstContactPhone),
          isActive: true,
        },
        update: {
          name: body.firstContactName.trim(),
          type: body.firstContactType,
          email: optionalText(body.firstContactEmail),
          phone: optionalText(body.firstContactPhone),
          isActive: true,
          deletedAt: null,
        },
      });

      // 7. Save Settings -> Wizard Completed
      await tx.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: 'wizard_completed' } },
        create: { tenantId, key: 'wizard_completed', value: 'true' },
        update: { value: 'true' },
      });

      return { product, contact, warehouse, currency };
    });

    return c.json({ success: true, data: result });
  },

  async cleanDemoData(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    await prisma.$transaction(async (tx) => {
      // 1. Transactional and related tables
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

      // 2. Sequence reset
      await tx.numberSequence.updateMany({
        where: { tenantId },
        data: { lastNum: 0 },
      });

      // 3. Clear master files so we reset onboarding
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      await tx.unit.deleteMany({ where: { tenantId } });
      await tx.warehouse.deleteMany({ where: { tenantId } });

      // 4. Remove onboarding status
      await tx.tenantSetting.deleteMany({
        where: { tenantId, key: 'wizard_completed' },
      });
    });

    return c.json({ success: true, message: 'Demo verileri başarıyla temizlendi, başlangıç sihirbazı aktif edildi.' });
  },
};
