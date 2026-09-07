import { FeatureKey, FeatureType, Plan, TenantStatus } from '@prisma/client';
import { z } from 'zod';

export const tenantPlanPayloadSchema = z.object({ tenantId: z.string().min(1), plan: z.nativeEnum(Plan) }).strict();
export const tenantStatusPayloadSchema = z.object({ tenantId: z.string().min(1), status: z.nativeEnum(TenantStatus) }).strict();
export const planFeaturePayloadSchema = z.object({
  plan: z.nativeEnum(Plan), key: z.string().min(1), value: z.string(), type: z.nativeEnum(FeatureType),
  isEnabled: z.boolean(), description: z.string().nullable().optional(), featureKey: z.nativeEnum(FeatureKey).nullable(),
}).strict();
export const featureOverridePayloadSchema = z.object({
  tenantId: z.string().min(1), featureKey: z.nativeEnum(FeatureKey), value: z.string(),
  isEnabled: z.boolean(), reason: z.string().nullable(),
}).strict();
export const featureOverrideDeletePayloadSchema = z.object({
  overrideId: z.string().min(1), tenantId: z.string().min(1), featureKey: z.nativeEnum(FeatureKey),
}).strict();

export const decisionSchema = z.object({ note: z.string().trim().max(1000).optional() }).strict();
