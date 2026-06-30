import { z } from 'zod';

// ─────────────────────────────────────────────
// API Error
// ─────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// Known error codes from backend
export const ERROR_CODES = {
  FORBIDDEN: 'FORBIDDEN',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  MODULE_DISABLED: 'MODULE_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────

export const PaginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export function PaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  });
}

export function SingleResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: itemSchema,
  });
}

// ─────────────────────────────────────────────
// Query Params
// ─────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface DateRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

// ─────────────────────────────────────────────
// Type guard
// ─────────────────────────────────────────────

export function isApiError(value: unknown): value is ApiError {
  return ApiErrorSchema.safeParse(value).success;
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) return error.error.message;
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (isApiError(response?.data)) return response.data.error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Beklenmeyen bir hata oluştu.';
}

export function getErrorCode(error: unknown): string | null {
  if (isApiError(error)) return error.error.code;
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (isApiError(response?.data)) return response.data.error.code;
  }
  return null;
}
