import axios, { type AxiosInstance } from 'axios';
import { API_URL } from '@/lib/constants';
import { installApiErrorInterceptor } from '@/lib/http/api-error.interceptor';
import { assertTenantResponseBoundary } from '@/lib/http/tenant-response.guard';
import { isTrialExpiredError, TRIAL_EXPIRED_MESSAGE } from '@/lib/http/trial-expiry.handler';
import { toast } from '@/store/ui.store';
import { ApiErrorSchema } from '@repo/types/contracts';

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

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  const normalized = ApiErrorSchema.safeParse(error);
  if (normalized.success && isTrialExpiredError(normalized.data)) {
    toast.warning(TRIAL_EXPIRED_MESSAGE, { label: 'Tam Sürüme Geç', href: '/checkout?billing=annual&source=tenant' }, 8_000);
  }
  return Promise.reject(error);
});

apiClient.interceptors.response.use(async (response) => {
  if (typeof window === 'undefined') return response;
  const { useAuthStore } = await import('@/store/auth.store');
  const activeTenantId = useAuthStore.getState().tenant?.id;
  if (activeTenantId) assertTenantResponseBoundary(response.data, activeTenantId);
  return response;
});

export { apiClient };
