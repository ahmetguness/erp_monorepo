'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { getQueryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth.store';

export interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const queryClient = getQueryClient();

  useEffect(() => {
    let activeTenantId = useAuthStore.getState().tenant?.id ?? null;
    return useAuthStore.subscribe((state) => {
      const nextTenantId = state.tenant?.id ?? null;
      if (nextTenantId === activeTenantId) return;
      activeTenantId = nextTenantId;
      queryClient.clear();
    });
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
