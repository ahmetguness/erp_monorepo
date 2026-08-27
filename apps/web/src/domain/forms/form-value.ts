const NUMBER_NORMALIZATION_PATTERN = /[^0-9,.-]/g;

export function parseDecimalInput(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const normalized = value.replace(NUMBER_NORMALIZATION_PATTERN, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const parseMoneyInput = parseDecimalInput;
export const parseQuantityInput = parseDecimalInput;
export const parsePercentageInput = parseDecimalInput;

export function parseOptionalDecimalInput(value: string | number | null | undefined): number | undefined {
  return value === null || value === undefined || value === '' ? undefined : parseDecimalInput(value);
}

export function optionalText(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function dateToFormValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  return (value instanceof Date ? value.toISOString() : value).split('T')[0] ?? '';
}

export function isSubmitLocked(isSubmitting: boolean, isMutationPending: boolean): boolean {
  return isSubmitting || isMutationPending;
}
