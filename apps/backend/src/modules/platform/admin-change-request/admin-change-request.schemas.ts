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
export const changeMetadataSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  ticketId: z.string().trim().min(2).max(100).optional(),
}).strict();

export const previewRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TENANT_PLAN_UPDATE'), payload: tenantPlanPayloadSchema }).strict(),
  z.object({ type: z.literal('TENANT_STATUS_UPDATE'), payload: tenantStatusPayloadSchema }).strict(),
  z.object({ type: z.literal('PLAN_FEATURE_UPDATE'), payload: planFeaturePayloadSchema }).strict(),
  z.object({ type: z.literal('FEATURE_OVERRIDE_UPSERT'), payload: featureOverridePayloadSchema }).strict(),
  z.object({ type: z.literal('FEATURE_OVERRIDE_DELETE'), payload: featureOverrideDeletePayloadSchema }).strict(),
]);

export type PreviewRequest = z.infer<typeof previewRequestSchema>;
