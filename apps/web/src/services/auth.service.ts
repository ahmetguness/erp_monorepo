import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';
import type { AuthUser, TenantInfo } from '@repo/types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
});

const TenantInfoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  companyName: z.string(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']),
  // Backend bazen string[] bazen space-separated string döndürebilir
  modules: z.union([
    z.array(z.string()),
    z.string().transform((s) => s.split(' ').filter(Boolean)),
  ]),
  trialEndsAt: z.string().nullable().optional(),
});

const AvailableTenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  companyName: z.string(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
});

const LoginResponseSchema = SingleResponseSchema(
  z.object({
    token: z.string(),
    user: AuthUserSchema,
    tenant: TenantInfoSchema,
    availableTenants: z.array(AvailableTenantSchema),
  }),
);

const RegisterResponseSchema = SingleResponseSchema(
  z.object({
    token: z.string(),
    user: AuthUserSchema,
    tenant: TenantInfoSchema,
  }),
);

const MeResponseSchema = SingleResponseSchema(
  z.object({
    user: AuthUserSchema,
    tenant: TenantInfoSchema,
  }),
);

// ─────────────────────────────────────────────
// Inferred types — cast to packages/types for store compatibility
// ─────────────────────────────────────────────

export type { AuthUser, TenantInfo };
export type AvailableTenant = z.infer<typeof AvailableTenantSchema>;
export type LoginResponse = {
  token: string;
  user: AuthUser;
  tenant: TenantInfo;
  availableTenants: AvailableTenant[];
};
export type RegisterResponse = {
  token: string;
  user: AuthUser;
  tenant: TenantInfo;
};

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface LoginCredentials {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface RegisterData {
  email: string;
  name: string;
  password: string;
  companyName: string;
  phone?: string;
}

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const res = await apiClient.post('/api/auth/login', credentials);
  const parsed = safeParse(LoginResponseSchema, res.data, 'login').data;
  return parsed as LoginResponse;
}

export async function register(data: RegisterData): Promise<RegisterResponse> {
  const res = await apiClient.post('/api/auth/register', data);
  const parsed = safeParse(RegisterResponseSchema, res.data, 'register').data;
  return parsed as RegisterResponse;
}

export async function getMe(): Promise<{ user: AuthUser; tenant: TenantInfo }> {
  const res = await apiClient.get('/api/auth/me');
  const parsed = safeParse(MeResponseSchema, res.data, 'getMe').data;
  return parsed as { user: AuthUser; tenant: TenantInfo };
}
