import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '@/lib/constants';
import { installApiErrorInterceptor } from '@/lib/http/api-error.interceptor';

export const adminApiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
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
  const data = error.response?.data;
  if (typeof data === 'object' && data !== null && 'code' in data && data.code === 'ADMIN_REAUTH_REQUIRED' && typeof window !== 'undefined') {
    window.location.assign('/admin/sessions?reauth=1');
  }
  return Promise.reject(error);
});
installApiErrorInterceptor(adminApiClient);
