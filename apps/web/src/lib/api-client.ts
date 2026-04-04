import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { ApiErrorSchema, type ApiError } from '@/types/api.types';

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ─────────────────────────────────────────────
// Cookie reader
// ─────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ─────────────────────────────────────────────
// Request interceptor — reads from cookies
// ─────────────────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getCookie('axon_token');
  const tenantId = getCookie('axon_tenant_id');

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (tenantId) config.headers['x-tenant-id'] = tenantId;

  return config;
});

// ─────────────────────────────────────────────
// Response interceptor
// ─────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const parsed = ApiErrorSchema.safeParse(error.response.data);
      if (parsed.success) {
        if (error.response.status === 401 && typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(parsed.data);
      }
      return Promise.reject({
        error: { code: 'UNKNOWN_ERROR', message: `Sunucu hatası: ${error.response.status}` },
      } as ApiError);
    }
    if (error.request) {
      return Promise.reject({
        error: { code: 'NETWORK_ERROR', message: 'Sunucuya bağlanılamadı.' },
      } as ApiError);
    }
    return Promise.reject({
      error: { code: 'UNKNOWN_ERROR', message: error.message },
    } as ApiError);
  },
);

export { apiClient };
