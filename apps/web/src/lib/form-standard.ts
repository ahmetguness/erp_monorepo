import { useEffect } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { isApiError } from '@/types/api.types';

const NUMBER_NORMALIZATION_PATTERN = /[^0-9,.-]/g;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDecimalInput(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const normalized = value
    .replace(NUMBER_NORMALIZATION_PATTERN, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseOptionalDecimalInput(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return parseDecimalInput(value);
}

export function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
): boolean {
  if (!isApiError(error) || !error.error.fields) return false;

  for (const [field, message] of Object.entries(error.error.fields)) {
    setError(field as Path<TFieldValues>, { type: 'server', message });
  }
  return true;
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

export function isSubmitLocked(isSubmitting: boolean, isMutationPending: boolean): boolean {
  return isSubmitting || isMutationPending;
}
