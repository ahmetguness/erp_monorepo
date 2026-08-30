import type { Prisma, PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../../errors/index.js';
import { StarterAccessService } from '../../../../services/starter-access.service.js';
import { buildOnboardingRecipe, currencySymbol } from '../../application/onboarding/onboarding-recipe.js';
import type { AdaptiveOnboardingInput, AdaptiveOnboardingResult, OnboardingRecipe } from '../../application/onboarding/onboarding.types.js';

type OnboardingDb = PrismaClient;
type OnboardingTx = Prisma.TransactionClient;

function nullable(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export class AdaptiveOnboardingService {
  constructor(private readonly db: OnboardingDb) {}

  async complete(tenantId: string, input: AdaptiveOnboardingInput): Promise<AdaptiveOnboardingResult> {
    const taxNumber = nullable(input.taxNumber);
    if (taxNumber) await this.ensureTaxNumberAvailable(tenantId, taxNumber);
    const recipe = buildOnboardingRecipe(input);

    await this.db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          companyName: input.companyName.trim(),
          country: input.country,
          sector: input.industry,
          taxNumber,
          taxOffice: nullable(input.taxOffice),
          address: nullable(input.address),
          city: nullable(input.city),
        },
      });
      await this.configureCurrency(tx, tenantId, recipe);
      await this.configureInvoiceSeries(tx, tenantId, recipe.invoicePrefix);
      await this.configureTaxRates(tx, tenantId, recipe.taxRates);
      await this.configureWarehouse(tx, tenantId, recipe.warehouseName);
      await this.saveProfile(tx, tenantId, input, recipe);
    });

    return {
      profile: {
        companyName: input.companyName.trim(),
        country: input.country,
        industry: input.industry,
        companyScale: input.companyScale,
        primaryGoal: input.primaryGoal,
      },
      applied: recipe,
      nextSteps: ['products', 'contacts', 'data_quality'],
    };
  }

  private async ensureTaxNumberAvailable(tenantId: string, taxNumber: string): Promise<void> {
    const existing = await this.db.tenant.findFirst({ where: { taxNumber, id: { not: tenantId } }, select: { id: true } });
    if (existing) throw new ValidationError('Bu vergi numarası başka bir firma tarafından kullanılıyor.', { taxNumber: 'Vergi numarası zaten kullanımda.' });
  }

  private async configureCurrency(tx: OnboardingTx, tenantId: string, recipe: OnboardingRecipe): Promise<void> {
    await tx.currency.updateMany({ where: { tenantId, code: { not: recipe.currencyCode } }, data: { isBase: false } });
    await tx.currency.upsert({
      where: { tenantId_code: { tenantId, code: recipe.currencyCode } },
      create: { tenantId, code: recipe.currencyCode, name: recipe.currencyCode, symbol: currencySymbol(recipe.currencyCode), defaultRate: 1, isBase: true },
      update: { isBase: true },
    });
  }

  private async configureInvoiceSeries(tx: OnboardingTx, tenantId: string, prefix: string): Promise<void> {
    await tx.numberSequence.upsert({
      where: { tenantId_module: { tenantId, module: 'invoice' } },
      create: { tenantId, module: 'invoice', prefix, lastNum: 0, padding: 6 },
      update: { prefix, padding: 6 },
    });
    await this.upsertSetting(tx, tenantId, 'invoice_prefix', prefix);
  }

  private async configureTaxRates(tx: OnboardingTx, tenantId: string, rates: readonly number[]): Promise<void> {
    for (const rate of rates) {
      const exists = await tx.taxRate.findFirst({ where: { tenantId, rate, isWithholding: false }, select: { id: true } });
      if (!exists) await tx.taxRate.create({ data: { tenantId, name: `Vergi %${rate}`, rate, isWithholding: false } });
    }
  }

  private async configureWarehouse(tx: OnboardingTx, tenantId: string, name: string): Promise<void> {
    const existing = await tx.warehouse.findFirst({ where: { tenantId }, select: { id: true } });
    if (existing) return;
    await new StarterAccessService(tx).enforceWarehouseCreation(tenantId, 1, 0);
    await tx.warehouse.create({ data: { tenantId, name, code: 'WH-01', isActive: true } });
  }

  private async saveProfile(tx: OnboardingTx, tenantId: string, input: AdaptiveOnboardingInput, recipe: OnboardingRecipe): Promise<void> {
    const settings: ReadonlyArray<readonly [string, string]> = [
      ['onboarding.version', '2'],
      ['onboarding.companyScale', input.companyScale],
      ['onboarding.primaryGoal', input.primaryGoal],
      ['onboarding.recommendedModules', JSON.stringify(recipe.recommendedModules)],
      ['wizard_completed', 'true'],
    ];
    for (const [key, value] of settings) await this.upsertSetting(tx, tenantId, key, value);
  }

  private async upsertSetting(tx: OnboardingTx, tenantId: string, key: string, value: string): Promise<void> {
    await tx.tenantSetting.upsert({ where: { tenantId_key: { tenantId, key } }, create: { tenantId, key, value }, update: { value } });
  }
}
