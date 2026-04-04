import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { ApiErrorSchema, type ApiError } from '@/types/api.types';

// ─────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─────────────────────────────────────────────
// Request interceptor — auth + tenant headers
// ─────────────────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('axon_token');
    const tenantId = localStorage.getItem('axon_tenant_id');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (tenantId) {
      config.headers['x-tenant-id'] = tenantId;
    }
  }
  return config;
});

// ─────────────────────────────────────────────
// Response interceptor — normalize errors
// ─────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const parsed = ApiErrorSchema.safeParse(error.response.data);

      if (parsed.success) {
        // 401 → clear auth and redirect
        if (error.response.status === 401 && typeof window !== 'undefined') {
          localStorage.removeItem('axon_token');
          localStorage.removeItem('axon_tenant_id');
          window.location.href = '/login';
        }
        return Promise.reject(parsed.data);
      }

      // Fallback for non-standard errors
      const fallback: ApiError = {
        error: {
          code: 'UNKNOWN_ERROR',
          message: `Sunucu hatası: ${error.response.status}`,
        },
      };
      return Promise.reject(fallback);
    }

    if (error.request) {
      const networkError: ApiError = {
        error: {
          code: 'NETWORK_ERROR',
          message: 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.',
        },
      };
      return Promise.reject(networkError);
    }

    const unknownError: ApiError = {
      error: {
        code: 'UNKNOWN_ERROR',
        message: error.message || 'Beklenmeyen bir hata oluştu.',
      },
    };
    return Promise.reject(unknownError);
  },
);

export { apiClient };
