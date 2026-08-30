import type { ApiError, ApiResponse, PaginatedResponse, PaginationMeta } from '@repo/types/contracts';
import type { ApplicationError } from '../domain/errors/application-error.js';

export function success<T>(data: T): ApiResponse<T> {
  return { data };
}

export function paginated<T>(data: T[], meta: PaginationMeta): PaginatedResponse<T> {
  return { data, meta };
}

export function errorResponse(error: ApplicationError, requestId?: string): ApiError {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(error.fields ? { fields: { ...error.fields } } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
}

export function apiError(
  code: string,
  message: string,
  options: { details?: unknown; fields?: Readonly<Record<string, string>>; requestId?: string } = {},
): ApiError {
  return {
    error: {
      code,
      message,
      ...(options.details !== undefined ? { details: options.details } : {}),
      ...(options.fields ? { fields: { ...options.fields } } : {}),
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  };
}
