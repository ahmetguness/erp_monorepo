import { describe, expect, it } from 'vitest';
import { adaptiveOnboardingSchema } from '../../src/modules/platform/application/onboarding/onboarding.schema.js';

const validInput = {
  companyName: 'Örnek A.Ş.',
  country: 'tr',
  industry: 'SERVICES',
  companyScale: 'MICRO',
  primaryGoal: 'SERVICE',
} as const;

describe('adaptiveOnboardingSchema', () => {
  it('minimum kurulum girdisini kabul eder ve ülke kodunu normalize eder', () => {
    const result = adaptiveOnboardingSchema.parse(validInput);
    expect(result.country).toBe('TR');
    expect(result.taxNumber).toBeUndefined();
  });

  it('bilinmeyen alanları ve desteklenmeyen profil değerlerini reddeder', () => {
    expect(adaptiveOnboardingSchema.safeParse({ ...validInput, warehouseName: 'Manipüle Depo' }).success).toBe(false);
    expect(adaptiveOnboardingSchema.safeParse({ ...validInput, primaryGoal: 'UNKNOWN' }).success).toBe(false);
  });

  it('boş firma adını reddeder', () => {
    expect(adaptiveOnboardingSchema.safeParse({ ...validInput, companyName: ' ' }).success).toBe(false);
  });
});
