import { z } from "zod";

export const updateSecurityFindingSchema = z.object({
  owner: z.string().trim().min(2).max(120).nullable().optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
}).strict().refine((value) => value.owner !== undefined || value.status !== undefined, "En az bir alan gönderilmelidir.");

export const createSecurityTicketSchema = z.object({
  ticketId: z.string().trim().min(2).max(120).optional(),
}).strict();
