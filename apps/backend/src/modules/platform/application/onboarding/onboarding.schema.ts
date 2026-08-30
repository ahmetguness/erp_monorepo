import { z } from 'zod';
import { ONBOARDING_COMPANY_SCALES, ONBOARDING_GOALS, ONBOARDING_INDUSTRIES } from './onboarding.types.js';

const optionalText = z.string().trim().max(250).optional();

export const adaptiveOnboardingSchema = z.object({
  companyName: z.string().trim().min(2, 'Firma adı en az 2 karakter olmalıdır.').max(160),
  country: z.string().trim().length(2, 'Ülke kodu iki karakter olmalıdır.').transform((value) => value.toUpperCase()),
  industry: z.enum(ONBOARDING_INDUSTRIES),
  companyScale: z.enum(ONBOARDING_COMPANY_SCALES),
  primaryGoal: z.enum(ONBOARDING_GOALS),
  taxNumber: optionalText,
  taxOffice: optionalText,
  address: z.string().trim().max(500).optional(),
  city: optionalText,
}).strict();

export type AdaptiveOnboardingBody = z.infer<typeof adaptiveOnboardingSchema>;
