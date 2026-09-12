import { z } from "zod";

export const inboxFiltersSchema = z.object({
  scope: z.enum(["ALL", "MINE", "UNASSIGNED"]).default("ALL"),
  includeResolved: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});

export const inboxActionSchema = z
  .object({
    category: z.enum(["APPROVAL", "SECURITY", "INCIDENT", "EXPIRATION"]),
    sourceId: z.string().min(1),
    action: z.enum(["READ", "UNREAD", "RESOLVE", "REOPEN", "ASSIGN"]),
    ownerId: z.string().min(1).optional(),
  })
  .strict()
  .refine((input) => input.action !== "ASSIGN" || input.ownerId, {
    message: "Atama için ownerId zorunludur.",
  });

export const inboxPreferencesSchema = z
  .object({
    approvals: z.boolean(),
    security: z.boolean(),
    incidents: z.boolean(),
    expirations: z.boolean(),
  })
  .strict();
