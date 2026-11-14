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
    const identity = () => JSON.stringify([useAuthStore.getState().tenant?.id, useAuthStore.getState().user?.id]);
    let activeIdentity = identity();
    return useAuthStore.subscribe((state) => {
      const nextIdentity = JSON.stringify([state.tenant?.id, state.user?.id]);
      if (nextIdentity === activeIdentity) return;
      activeIdentity = nextIdentity;
      queryClient.clear();
    });
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
