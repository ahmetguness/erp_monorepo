import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { saveAuthToken, removeAuthToken } from '../lib/token-storage';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const RolePermissionSchema = z.object({
  module: z.string(),
  action: z.string(),
});

export const RoleRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  isSystem: z.boolean().optional(),
  permissions: z.array(RolePermissionSchema).optional(),
});

export const TenantMembershipSchema = z.object({
  isOwner: z.boolean(),
  roleId: z.string().nullable().optional(),
  role: RoleRefSchema.nullable().optional(),
});

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  tenantMembership: TenantMembershipSchema.optional(),
});

export const TenantInfoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  companyName: z.string(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']).catch('STARTER'),
  status: z
    .enum([
      'TRIAL',
      'ACTIVE',
      'SUSPENDED',
      'CANCELLED',
      'ARCHIVED',
      'DELETION_SCHEDULED',
      'DELETED',
    ])
    .catch('ACTIVE'),
  modules: z.union([
    z.array(z.string()),
    z.string().transform((s) => s.split(' ').filter(Boolean)),
  ]),
  trialEndsAt: z.string().nullable().optional(),
});

export const AvailableTenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  companyName: z.string(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']).catch('STARTER'),
});

const LoginResponseSchema = SingleResponseSchema(
  z.object({
    token: z.string().optional(),
    user: AuthUserSchema,
    tenant: TenantInfoSchema,
    availableTenants: z.array(AvailableTenantSchema).optional(),
  })
);

const MeResponseSchema = SingleResponseSchema(
  z.object({
    user: AuthUserSchema,
    tenant: TenantInfoSchema,
    preferences: z.record(z.string(), z.unknown()).nullable().optional(),
  })
);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type TenantInfo = z.infer<typeof TenantInfoSchema>;
export type AvailableTenant = z.infer<typeof AvailableTenantSchema>;

export type LoginResponse = {
  token?: string;
  user: AuthUser;
  tenant: TenantInfo;
  availableTenants?: AvailableTenant[];
};

export interface LoginCredentials {
  email: string;
  password: string;
  tenantSlug?: string;
  rememberMe?: boolean;
}

export interface SwitchTenantParams {
  tenantId?: string;
  tenantSlug?: string;
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const res = await apiClient.post('/api/auth/login', credentials);
  const parsed = LoginResponseSchema.parse(res.data);
  const data = parsed.data as LoginResponse;
  if (data.token) {
    await saveAuthToken(data.token);
  }
  return data;
}

export async function switchTenant(params: SwitchTenantParams): Promise<LoginResponse> {
  const res = await apiClient.post('/api/auth/switch-tenant', params);
  const parsed = LoginResponseSchema.parse(res.data);
  const data = parsed.data as LoginResponse;
  if (data.token) {
    await saveAuthToken(data.token);
  }
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout');
  } finally {
    await removeAuthToken();
  }
}

export async function getMe(): Promise<{ user: AuthUser; tenant: TenantInfo; preferences: Record<string, unknown> | null }> {
  const res = await apiClient.get('/api/auth/me');
  const parsed = MeResponseSchema.parse(res.data);
  return parsed.data as { user: AuthUser; tenant: TenantInfo; preferences: Record<string, unknown> | null };
}
