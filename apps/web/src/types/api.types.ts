import {
  API_ERROR_CODES,
  ApiErrorSchema,
  PaginatedResponseSchema,
  PaginationMetaSchema,
  SingleResponseSchema,
  type ApiError,
  type PaginationMeta,
} from '@repo/types/contracts';

export {
  ApiErrorSchema,
  PaginatedResponseSchema,
  PaginationMetaSchema,
  SingleResponseSchema,
  type ApiError,
  type PaginationMeta,
};

// ─────────────────────────────────────────────
// API Error
// ─────────────────────────────────────────────

// Known error codes from backend
export const ERROR_CODES = {
  FORBIDDEN: API_ERROR_CODES.FORBIDDEN,
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  MODULE_DISABLED: 'MODULE_DISABLED',
  NOT_FOUND: API_ERROR_CODES.NOT_FOUND,
  VALIDATION_ERROR: API_ERROR_CODES.VALIDATION,
  UNAUTHORIZED: API_ERROR_CODES.UNAUTHORIZED,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────

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
