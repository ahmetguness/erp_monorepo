import type { ModuleKey, PlanName } from "./plans.js";

export type TenantProvisioningStepKey =
  | "TENANT_CREATED"
  | "OWNER_CREATED"
  | "DEFAULT_ROLES_CREATED"
  | "EMAIL_SENT";
export type TenantProvisioningStepStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

export interface TenantProvisioningInput {
  companyName: string;
  email: string;
  ownerName: string;
  slug?: string;
  phone?: string;
  city?: string;
  sector?: string;
  plan: PlanName;
  status: "TRIAL" | "ACTIVE";
  maxUsers?: number | null;
  modules: ModuleKey[];
  notes?: string;
  isCustomPricing?: boolean;
  trialEndsAt?: string | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
}

export interface TenantProvisioningPreview {
  valid: boolean;
  normalizedSlug: string;
  normalizedEmail: string;
  ownerExistingTenantNames: string[];
  effectiveModules: ModuleKey[];
  checks: Array<{
    key: "SLUG" | "OWNER" | "PLAN_MODULES" | "DATES";
    valid: boolean;
    message: string;
  }>;
  emailPreview: {
    to: string;
    subject: string;
    passwordLinkExpiresInMinutes: number;
  };
}

export interface TenantProvisioningJob {
  id: string;
  tenantId: string | null;
  idempotencyKey: string;
  status: TenantProvisioningStepStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  steps: Array<{
    key: TenantProvisioningStepKey;
    status: TenantProvisioningStepStatus;
    attempts: number;
    error: string | null;
    updatedAt: string;
  }>;
}
