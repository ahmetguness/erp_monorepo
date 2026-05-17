import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
});

export const TenantInfoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  companyName: z.string(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']),
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
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
});

const LoginResponseSchema = SingleResponseSchema(
  z.object({
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

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const res = await apiClient.post('/api/auth/login', credentials);
  const parsed = LoginResponseSchema.parse(res.data);
  return parsed.data as LoginResponse;
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');
}

export async function getMe(): Promise<{ user: AuthUser; tenant: TenantInfo; preferences: Record<string, unknown> | null }> {
  const res = await apiClient.get('/api/auth/me');
  const parsed = MeResponseSchema.parse(res.data);
  return parsed.data as { user: AuthUser; tenant: TenantInfo; preferences: Record<string, unknown> | null };
}
