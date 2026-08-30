import { normalizeApiError } from '@/lib/http/api-error.interceptor';

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getFieldErrors<T extends string>(error: unknown, fields: readonly T[]): FieldErrors<T> {
  const payload = normalizeApiError(error);
  const source = payload.error.fields ?? (isUnknownRecord(payload.error.details) ? payload.error.details : undefined);
  if (source) {
    return fields.reduce<FieldErrors<T>>((accumulator, field) => {
      const value = source[field];
      if (typeof value === 'string') accumulator[field] = value;
      return accumulator;
    }, {});
  }

  const message = payload.error.message;
  const matchedField = fields.find((field) => message.toLowerCase().includes(field.toLowerCase()));
  return matchedField ? { [matchedField]: message } as FieldErrors<T> : {};
}
