import { z } from "zod";

export const platformAuditFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(), module: z.string().trim().max(100).optional(),
  actorId: z.string().trim().max(100).optional(), target: z.string().trim().max(200).optional(),
  outcome: z.enum(["SUCCESS", "DENIED", "FAILED"]).optional(),
}).strict();
export const auditExportSchema = platformAuditFiltersSchema.omit({ page: true, limit: true }).extend({ format: z.enum(["csv", "json"]).default("json") });
export const retentionPolicySchema = z.object({ retentionDays: z.number().int().min(365).max(3650) }).strict();
export type PlatformAuditFiltersInput = z.infer<typeof platformAuditFiltersSchema>;
