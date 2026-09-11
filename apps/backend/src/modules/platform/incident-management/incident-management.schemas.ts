import { z } from "zod";

export const incidentSeveritySchema = z.enum(["SEV1", "SEV2", "SEV3"]);
export const incidentStatusSchema = z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]);

export const createIncidentSchema = z.object({
  alertId: z.string().cuid().nullable().optional(),
  title: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(2000),
  severity: incidentSeveritySchema,
  owner: z.string().trim().min(2).max(120),
  runbookUrl: z.string().trim().url().max(500),
  affectedTenantIds: z.array(z.string().cuid()).max(500).default([]),
}).strict();

export const updateIncidentSchema = z.object({
  status: incidentStatusSchema.optional(),
  severity: incidentSeveritySchema.optional(),
  owner: z.string().trim().min(2).max(120).optional(),
  runbookUrl: z.string().trim().url().max(500).optional(),
  rootCause: z.string().trim().min(10).max(5000).nullable().optional(),
  resolution: z.string().trim().min(10).max(5000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "En az bir alan gönderilmelidir.");

export const timelineEntrySchema = z.object({
  message: z.string().trim().min(3).max(3000),
}).strict();

export const communicationSchema = z.object({
  message: z.string().trim().min(10).max(3000),
}).strict();

export const communicationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().min(3).max(1000),
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
