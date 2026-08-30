import type { AdaptiveOnboardingInput, OnboardingGoal, OnboardingIndustry, OnboardingRecipe } from './onboarding.types.js';

const MODULES_BY_GOAL: Record<OnboardingGoal, readonly string[]> = {
  SALES: ['contacts', 'invoicing', 'sales'],
  FINANCE: ['accounting', 'payments', 'reports'],
  INVENTORY: ['inventory', 'warehouses', 'purchasing'],
  PROCUREMENT: ['purchasing', 'inventory', 'approvals'],
  PRODUCTION: ['production', 'inventory', 'purchasing'],
  SERVICE: ['service', 'contacts', 'invoicing'],
};

const MODULES_BY_INDUSTRY: Record<OnboardingIndustry, readonly string[]> = {
  RETAIL: ['inventory', 'invoicing'],
  WHOLESALE: ['sales', 'purchasing', 'inventory'],
  SERVICES: ['service', 'contacts'],
  MANUFACTURING: ['production', 'inventory'],
  ECOMMERCE: ['marketplace', 'inventory'],
  OTHER: [],
};

const COUNTRY_DEFAULTS: Readonly<Record<string, Pick<OnboardingRecipe, 'currencyCode' | 'taxRates'>>> = {
  TR: { currencyCode: 'TRY', taxRates: [20, 10, 1] },
  DE: { currencyCode: 'EUR', taxRates: [19, 7, 0] },
  US: { currencyCode: 'USD', taxRates: [0] },
  GB: { currencyCode: 'GBP', taxRates: [20, 5, 0] },
};

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function buildOnboardingRecipe(input: AdaptiveOnboardingInput): OnboardingRecipe {
  const country = COUNTRY_DEFAULTS[input.country] ?? { currencyCode: 'EUR', taxRates: [20, 10, 0] };
  return {
    currencyCode: country.currencyCode,
    warehouseName: input.industry === 'SERVICES' ? 'Merkez' : 'Merkez Depo',
    invoicePrefix: input.country === 'TR' ? 'FTR' : 'INV',
    taxRates: country.taxRates,
    recommendedModules: unique([...MODULES_BY_GOAL[input.primaryGoal], ...MODULES_BY_INDUSTRY[input.industry]]),
  };
}

export function currencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
}
