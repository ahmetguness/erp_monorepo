import { FeatureKey, Plan } from "@prisma/client";
import { z } from "zod";

export const rolloutEnvironmentSchema = z.enum([
  "DEVELOPMENT",
  "STAGING",
  "PRODUCTION",
]);
export const rolloutStageSchema = z.enum([
  "DEVELOPMENT",
  "INTERNAL",
  "PILOT",
  "PERCENTAGE",
  "GENERAL",
]);

export const createFeatureRolloutSchema = z
  .object({
    plan: z.nativeEnum(Plan),
    featureKey: z.nativeEnum(FeatureKey),
    environment: rolloutEnvironmentSchema,
    stage: rolloutStageSchema,
    value: z.string().max(500),
    isEnabled: z.boolean(),
    rolloutPercentage: z.number().int().min(0).max(100),
    targetTenantIds: z.array(z.string().min(1)).max(500).default([]),
    dependencies: z.array(z.nativeEnum(FeatureKey)).max(50).default([]),
    conflicts: z.array(z.nativeEnum(FeatureKey)).max(50).default([]),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    errorThresholdPct: z.number().min(0).max(100),
    reason: z.string().trim().min(10).max(1000),
    ticketId: z.string().trim().min(2).max(100).optional(),
  })
  .strict();

export const rolloutMetricSchema = z
  .object({ errorRatePct: z.number().min(0).max(100) })
  .strict();
export const rolloutStopSchema = z
  .object({
    reason: z.string().trim().min(10).max(1000),
    killSwitch: z.boolean().default(false),
  })
  .strict();

export const rolloutActivationPayloadSchema = z
  .object({ rolloutId: z.string().min(1) })
  .strict();
