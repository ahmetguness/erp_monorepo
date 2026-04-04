'use client';

import { QueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/types/api.types';

// ─────────────────────────────────────────────
// TanStack Query global config
// ─────────────────────────────────────────────

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0, // Her zaman fresh fetch
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors
          const msg = getErrorMessage(error);
          if (msg.includes('401') || msg.includes('403') || msg.includes('404')) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Singleton for client-side
let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create new
    return makeQueryClient();
  }
  // Browser: reuse singleton
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
