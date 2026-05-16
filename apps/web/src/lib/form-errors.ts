import { AxiosError } from 'axios';

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

interface ApiErrorPayload {
  error?: {
    message?: string;
    details?: unknown;
  };
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null;
}

export function getFieldErrors<T extends string>(error: unknown, fields: readonly T[]): FieldErrors<T> {
  if (!(error instanceof AxiosError) || !isApiErrorPayload(error.response?.data)) return {};

  const payload = error.response.data;
  const details = payload.error?.details;
  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    return fields.reduce<FieldErrors<T>>((acc, field) => {
      const value = record[field];
      if (typeof value === 'string') acc[field] = value;
      return acc;
    }, {});
  }

  const message = payload.error?.message ?? error.message;
  const matchedField = fields.find((field) => message.toLowerCase().includes(field.toLowerCase()));
  if (!matchedField) return {};
  const errors: FieldErrors<T> = {};
  errors[matchedField] = message;
  return errors;
}
