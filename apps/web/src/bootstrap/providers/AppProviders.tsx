'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { getQueryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { subscribeTenantSession, tenantSessionRevision } from '@/lib/http/tenant-session';

export interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const queryClient = getQueryClient();
  const revision = useSyncExternalStore(subscribeTenantSession, tenantSessionRevision, () => 0);

  useEffect(() => {
    const identity = () => JSON.stringify([useAuthStore.getState().tenant?.id, useAuthStore.getState().user?.id, useAuthStore.getState().sessionVersion]);
    let activeIdentity = identity();
    return useAuthStore.subscribe((state) => {
      const nextIdentity = JSON.stringify([state.tenant?.id, state.user?.id, state.sessionVersion]);
      if (nextIdentity === activeIdentity) return;
      activeIdentity = nextIdentity;
      queryClient.clear();
      useUIStore.setState({ toasts: [], commandPaletteOpen: false });
    });
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}><Fragment key={revision}>{children}</Fragment></QueryClientProvider>;
}
