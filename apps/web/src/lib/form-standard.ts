import { useEffect } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorSchema } from '@/types/api.types';
import { normalizeApiError } from '@/lib/http/api-error.interceptor';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
import { parseDecimalInput } from '@/domain/forms/form-value';

export {
  dateToFormValue,
  isSubmitLocked,
  optionalText,
  parseDecimalInput,
  parseMoneyInput,
  parseOptionalDecimalInput,
  parsePercentageInput,
  parseQuantityInput,
} from '@/domain/forms/form-value';

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

export function getServerFieldErrors(error: unknown): Record<string, string> {
  const parsed = ApiErrorSchema.safeParse(normalizeApiError(error));
  if (!parsed.success) return {};

  if (parsed.data.error.fields) return parsed.data.error.fields;
  if (isStringRecord(parsed.data.error.details)) return parsed.data.error.details;
  return {};
}

export const requiredDateString = (message = 'Tarih zorunlu') =>
  z.string().regex(ISO_DATE_PATTERN, message);

export const optionalDateString = () =>
  z.string().regex(ISO_DATE_PATTERN, 'Geçerli bir tarih girin').optional().or(z.literal(''));

export const requiredMoneyString = (message = 'Tutar 0’dan büyük olmalı') =>
  z.string().min(1, 'Tutar zorunlu').refine((value) => parseDecimalInput(value) > 0, message);

export const requiredNonNegativeMoneyString = (message = 'Tutar negatif olamaz') =>
  z.string().min(1, 'Tutar zorunlu').refine((value) => parseDecimalInput(value) >= 0, message);

export const optionalMoneyString = (message = 'Tutar 0’dan büyük olmalı') =>
  z.string().optional().refine((value) => !value || parseDecimalInput(value) > 0, message);

export const requiredQuantityString = (message = 'Miktar 0’dan büyük olmalı') =>
  z.string().min(1, 'Miktar zorunlu').refine((value) => parseDecimalInput(value) > 0, message);

export const optionalPercentString = (message = 'Oran 0 ile 100 arasında olmalı') =>
  z.string().optional().refine((value) => {
    if (!value) return true;
    const parsed = parseDecimalInput(value);
    return parsed >= 0 && parsed <= 100;
  }, message);

export function applyServerFieldErrors<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  fields: readonly Path<TFieldValues>[],
): boolean {
  const fieldErrors = getServerFieldErrors(error);
  if (Object.keys(fieldErrors).length === 0) return false;

  let applied = false;
  for (const field of fields) {
    const message = fieldErrors[field];
    if (message) {
      setError(field, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}

export function useDirtyStateWarning(isDirty: boolean, message = 'Kaydedilmemiş değişiklikler var. Sayfadan ayrılmak istiyor musunuz?') {
  useEffect(() => {
    if (!isDirty) return undefined;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, message]);
}
