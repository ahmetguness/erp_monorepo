import { z } from "zod";
export const createRequestSchema = z
  .object({
    tenantId: z.string().min(1),
    subjectEmail: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    type: z.enum(["EXPORT", "ERASURE", "ANONYMIZATION"]),
    scope: z.array(z.enum(["IDENTITY", "MEMBERSHIP", "AUDIT"])).min(1),
    reason: z.string().trim().min(10).max(2000),
    ticketId: z.string().trim().min(2).max(120),
  })
  .strict();
export const verificationSchema = z
  .object({ evidence: z.string().trim().min(10).max(1000) })
  .strict();
export const decisionSchema = z
  .object({ approve: z.boolean(), reason: z.string().trim().min(10).max(1000) })
  .strict();
export const legalHoldSchema = z
  .object({
    tenantId: z.string().min(1),
    subjectEmail: z
      .string()
      .email()
      .transform((v) => v.toLowerCase())
      .optional(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
