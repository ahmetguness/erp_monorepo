import { z } from "zod";
export const sensitiveFieldSchema = z.enum(["email", "phone", "errorDetails"]);
export const accessPurposeSchema = z.enum(["SUPPORT_CASE", "SECURITY_INVESTIGATION", "BILLING_VALIDATION", "INCIDENT_RESPONSE"]);
export const createSensitiveAccessGrantSchema = z.object({
  tenantId: z.string().min(1), fields: z.array(sensitiveFieldSchema).min(1).max(3),
  purpose: accessPurposeSchema, reason: z.string().trim().min(10).max(500),
}).strict();
