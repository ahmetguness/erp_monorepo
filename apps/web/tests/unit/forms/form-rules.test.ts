import { describe, expect, it } from 'vitest';
import { dateToFormValue, isSubmitLocked, optionalText, parseDecimalInput, parseOptionalDecimalInput } from '../../../src/domain/forms/form-value';
import { getPasswordPolicyError, isPasswordStrong, PASSWORD_POLICY_MESSAGE } from '../../../src/lib/password-policy';

describe('form rules', () => {
  it('normalizes decimal values', () => {
    expect(parseDecimalInput('12,50')).toBe(12.5);
    expect(parseDecimalInput('invalid')).toBe(0);
    expect(parseOptionalDecimalInput('')).toBeUndefined();
    expect(parseOptionalDecimalInput('4,25')).toBe(4.25);
  });

  it('normalizes optional text and dates', () => {
    expect(optionalText('  note  ')).toBe('note');
    expect(optionalText('   ')).toBeUndefined();
    expect(dateToFormValue('2026-08-27T12:30:00.000Z')).toBe('2026-08-27');
    expect(dateToFormValue(null)).toBe('');
  });

  it('combines submission locks', () => {
    expect(isSubmitLocked(true, false)).toBe(true);
    expect(isSubmitLocked(false, true)).toBe(true);
    expect(isSubmitLocked(false, false)).toBe(false);
  });

  it('enforces the shared password policy', () => {
    expect(isPasswordStrong('StrongPass1')).toBe(true);
    expect(getPasswordPolicyError('weak')).toBe(PASSWORD_POLICY_MESSAGE);
  });
});
