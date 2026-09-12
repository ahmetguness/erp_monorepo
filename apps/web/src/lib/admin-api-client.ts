import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '@/lib/constants';
import { installApiErrorInterceptor } from '@/lib/http/api-error.interceptor';
import { createClientIdempotencyKey } from '@/lib/idempotency';

export const adminApiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

adminApiClient.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase() ?? 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !config.headers.has('Idempotency-Key')) {
    config.headers.set('Idempotency-Key', createClientIdempotencyKey('admin'));
  }
  return config;
});

let refreshPromise: Promise<unknown> | null = null;
type RetryConfig = InternalAxiosRequestConfig & { adminRetried?: boolean };
adminApiClient.interceptors.response.use((response) => response, async (error: unknown) => {
  if (!axios.isAxiosError<unknown>(error) || !error.config) return Promise.reject(error);
  const config: RetryConfig = error.config;
  const url = config.url ?? '';
  if (error.response?.status === 401 && !config.adminRetried && !['/auth/login', '/auth/logout', '/auth/refresh', '/auth/reauthenticate'].some((path) => url.includes(path))) {
    config.adminRetried = true;
    refreshPromise ??= axios.post(`${API_URL}/api/admin/auth/refresh`, {}, { withCredentials: true }).finally(() => { refreshPromise = null; });
    await refreshPromise;
    return adminApiClient.request(config);
  }
  return Promise.reject(error);
});
installApiErrorInterceptor(adminApiClient);
