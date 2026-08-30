export const ONBOARDING_INDUSTRIES = ['RETAIL', 'WHOLESALE', 'SERVICES', 'MANUFACTURING', 'ECOMMERCE', 'OTHER'] as const;
export const ONBOARDING_COMPANY_SCALES = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE'] as const;
export const ONBOARDING_GOALS = ['SALES', 'FINANCE', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'SERVICE'] as const;

export type OnboardingIndustry = (typeof ONBOARDING_INDUSTRIES)[number];
export type OnboardingCompanyScale = (typeof ONBOARDING_COMPANY_SCALES)[number];
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

export interface AdaptiveOnboardingInput {
  companyName: string;
  country: string;
  industry: OnboardingIndustry;
  companyScale: OnboardingCompanyScale;
  primaryGoal: OnboardingGoal;
  taxNumber?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
}

export interface OnboardingRecipe {
  currencyCode: string;
  warehouseName: string;
  invoicePrefix: string;
  taxRates: readonly number[];
  recommendedModules: readonly string[];
}

export interface AdaptiveOnboardingResult {
  profile: {
    companyName: string;
    country: string;
    industry: OnboardingIndustry;
    companyScale: OnboardingCompanyScale;
    primaryGoal: OnboardingGoal;
  };
  applied: {
    currencyCode: string;
    warehouseName: string;
    invoicePrefix: string;
    taxRates: readonly number[];
    recommendedModules: readonly string[];
  };
  nextSteps: readonly ['products', 'contacts', 'data_quality'];
}
