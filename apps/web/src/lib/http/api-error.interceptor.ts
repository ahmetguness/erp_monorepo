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
    const response = ApiErrorSchema.safeParse(error.response?.data);
    if (response.success) return response.data;
    if (error.response) return fallbackError(API_ERROR_CODES.UNKNOWN, `Sunucu hatası: ${error.response.status}`);
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
