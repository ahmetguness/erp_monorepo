export interface AdminApiErrorEnvelope {
  error: { code: string; message: string; fields?: Record<string, string>; details?: unknown };
}

export interface OptimisticConcurrencyInput {
  expectedUpdatedAt: string;
}

export interface AdminTenantSettingsUpdate extends OptimisticConcurrencyInput {
  maxUsers?: number | null;
  modules?: string[];
  notes?: string;
  isCustomPricing?: boolean;
  trialEndsAt?: string | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  notify?: boolean;
}
