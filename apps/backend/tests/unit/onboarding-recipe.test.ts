import { describe, expect, it } from 'vitest';
import { buildOnboardingRecipe } from '../../src/modules/platform/application/onboarding/onboarding-recipe.js';

describe('buildOnboardingRecipe', () => {
  it('Türkiye satış tenantı için yerel ve satış odaklı ayarlar üretir', () => {
    const recipe = buildOnboardingRecipe({
      companyName: 'Örnek A.Ş.',
      country: 'TR',
      industry: 'WHOLESALE',
      companyScale: 'SMALL',
      primaryGoal: 'SALES',
    });

    expect(recipe).toMatchObject({ currencyCode: 'TRY', invoicePrefix: 'FTR', warehouseName: 'Merkez Depo' });
    expect(recipe.taxRates).toEqual([20, 10, 1]);
    expect(recipe.recommendedModules).toEqual(['contacts', 'invoicing', 'sales', 'purchasing', 'inventory']);
  });

  it('hizmet tenantı için depo adını ve hedef modülleri adapte eder', () => {
    const recipe = buildOnboardingRecipe({
      companyName: 'Service Ltd',
      country: 'GB',
      industry: 'SERVICES',
      companyScale: 'MICRO',
      primaryGoal: 'SERVICE',
    });

    expect(recipe.currencyCode).toBe('GBP');
    expect(recipe.warehouseName).toBe('Merkez');
    expect(recipe.recommendedModules).toEqual(['service', 'contacts', 'invoicing']);
  });

  it('Almanya için EUR ve ülkeye uygun vergi oranlarını seçer', () => {
    const recipe = buildOnboardingRecipe({
      companyName: 'Handel GmbH',
      country: 'DE',
      industry: 'RETAIL',
      companyScale: 'SMALL',
      primaryGoal: 'INVENTORY',
    });

    expect(recipe.currencyCode).toBe('EUR');
    expect(recipe.taxRates).toEqual([19, 7, 0]);
  });
});
