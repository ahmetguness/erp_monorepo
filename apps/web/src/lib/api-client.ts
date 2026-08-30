import axios, { type AxiosInstance } from 'axios';
import { API_URL } from '@/lib/constants';
import { installApiErrorInterceptor } from '@/lib/http/api-error.interceptor';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
  withCredentials: true,
});

function clearUnauthorizedSession(): void {
  if (typeof window === 'undefined') return;
  document.cookie = 'axon_token=; path=/; max-age=0; SameSite=Lax';
  import('@/store/auth.store')
    .then(({ useAuthStore }) => useAuthStore.getState().logout())
    .catch(() => undefined);

  if (window.location.pathname.startsWith('/login')) return;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const loginUrl = new URL('/login', window.location.origin);
  if (currentPath.startsWith('/dashboard')) loginUrl.searchParams.set('from', currentPath);
  window.location.replace(loginUrl.toString());
}

installApiErrorInterceptor(apiClient, { onUnauthorized: clearUnauthorizedSession });

export { apiClient };
