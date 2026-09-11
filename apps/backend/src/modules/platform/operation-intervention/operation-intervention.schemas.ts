import { z } from "zod";

export const operationItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["DOMAIN_EVENT", "MARKETPLACE_JOB"]),
  })
  .strict();

export const operationInterventionSchema = z
  .object({
    items: z.array(operationItemSchema).min(1).max(50),
    action: z.enum(["RETRY", "QUARANTINE", "RESOLVE"]),
    reason: z.string().trim().min(10).max(1000),
    dryRun: z.boolean().default(false),
  })
  .strict();
