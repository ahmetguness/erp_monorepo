import axios, { type AxiosInstance } from 'axios';
import { API_ERROR_CODES, ApiErrorSchema, type ApiError } from '@repo/types/contracts';

interface ApiErrorInterceptorOptions {
  onUnauthorized?: () => void;
}

function fallbackError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function normalizeApiError(error: unknown): ApiError {
  const direct = ApiErrorSchema.safeParse(error);
  if (direct.success) return direct.data;

  if (axios.isAxiosError<unknown>(error)) {
    const data = error.response?.data;
    const directResponse = ApiErrorSchema.safeParse(data);
    if (directResponse.success) return directResponse.data;

    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>;
      // Case A: { error: string, code?: string }
      if (typeof rec.error === 'string') {
        let code = typeof rec.code === 'string' ? rec.code : undefined;
        if (!code) {
          if (error.response?.status === 401) code = API_ERROR_CODES.UNAUTHORIZED;
          else if (error.response?.status === 403) code = 'FORBIDDEN';
          else if (error.response?.status === 404) code = 'NOT_FOUND';
          else if (error.response?.status === 409) code = 'CONFLICT';
          else if (error.response?.status === 422) code = 'VALIDATION_ERROR';
          else code = API_ERROR_CODES.UNKNOWN;
        }
        return {
          error: {
            code,
            message: rec.error,
            details: rec.details,
            fields: (rec.fields as Record<string, string>) ?? undefined,
          },
        };
      }
      // Case B: { message: string, code?: string }
      if (typeof rec.message === 'string') {
        let code = typeof rec.code === 'string' ? rec.code : undefined;
        if (!code) {
          if (error.response?.status === 401) code = API_ERROR_CODES.UNAUTHORIZED;
          else if (error.response?.status === 403) code = 'FORBIDDEN';
          else code = API_ERROR_CODES.UNKNOWN;
        }
        return {
          error: {
            code,
            message: rec.message,
            details: rec.details,
            fields: (rec.fields as Record<string, string>) ?? undefined,
          },
        };
      }
      // Case C: { code: string }
      if (typeof rec.code === 'string') {
        return {
          error: {
            code: rec.code,
            message: typeof rec.error === 'string' ? rec.error : `İşlem hatası: ${rec.code}`,
            details: rec.details,
            fields: (rec.fields as Record<string, string>) ?? undefined,
          },
        };
      }
    }

    if (error.response) {
      const status = error.response.status;
      let statusCode: string = API_ERROR_CODES.UNKNOWN;
      if (status === 401) statusCode = API_ERROR_CODES.UNAUTHORIZED;
      else if (status === 403) statusCode = 'FORBIDDEN';
      else if (status === 404) statusCode = 'NOT_FOUND';
      else if (status === 409) statusCode = 'CONFLICT';
      else if (status === 422) statusCode = 'VALIDATION_ERROR';
      else if (status === 429) statusCode = 'RATE_LIMITED';
      return fallbackError(statusCode, `Sunucu hatası: ${status}`);
    }
    if (error.request) return fallbackError(API_ERROR_CODES.NETWORK, 'Sunucuya bağlanılamadı.');
    return fallbackError(API_ERROR_CODES.UNKNOWN, error.message);
  }

  return fallbackError(
    API_ERROR_CODES.UNKNOWN,
    error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.',
  );
}

export function installApiErrorInterceptor(
  client: AxiosInstance,
  options: ApiErrorInterceptorOptions = {},
): void {
  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const normalized = normalizeApiError(error);
      if (normalized.error.code === API_ERROR_CODES.UNAUTHORIZED) options.onUnauthorized?.();
      return Promise.reject(normalized);
    },
  );
}
