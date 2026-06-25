import axios, { AxiosError, type AxiosInstance } from 'axios';
import { API_URL } from '@/lib/constants';
import { ApiErrorSchema, type ApiError } from '@/types/api.types';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
  withCredentials: true,
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
          // Store'u temizle ve login'e yönlendir
          // Dinamik import ile circular dependency'den kaçın
          import('@/store/auth.store').then(({ useAuthStore }) => {
            useAuthStore.getState().logout();
          }).catch(() => {});
          window.location.replace('/login');
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
