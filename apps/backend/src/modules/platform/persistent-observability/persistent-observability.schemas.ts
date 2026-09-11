import { z } from "zod";

export const observabilityRangeSchema = z.enum(["1h", "24h", "7d", "30d"]);
export const observabilityScopeSchema = z.enum(["SERVICE", "TENANT"]);
export const sloSchema = z.object({
  name: z.string().trim().min(3).max(120), scope: observabilityScopeSchema,
  scopeId: z.string().trim().min(1).max(120), metricKey: z.string().trim().min(2).max(120),
  targetPercentage: z.number().min(0).max(100), windowDays: z.number().int().min(1).max(90),
  owner: z.string().trim().min(2).max(120), runbookUrl: z.string().trim().url().max(500),
  notificationChannel: z.string().trim().min(2).max(200), isEnabled: z.boolean().default(true),
}).strict();
export const alertOwnershipSchema = z.object({
  owner: z.string().trim().min(2).max(120), runbookUrl: z.string().trim().url().max(500),
  notificationChannel: z.string().trim().min(2).max(200),
}).strict();
export const alertSilenceSchema = z.object({ until: z.coerce.date(), reason: z.string().trim().min(10).max(1000) }).strict();
export const deploymentSchema = z.object({
  service: z.string().trim().min(2).max(120), version: z.string().trim().min(1).max(120),
  environment: z.string().trim().min(2).max(50), description: z.string().trim().max(500).nullable().optional(),
  deployedAt: z.coerce.date(),
}).strict();
