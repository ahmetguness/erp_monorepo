import { z } from "zod";

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const adminMutationBodySchema = z.record(z.string(), z.unknown());
export const tenantSettingsUpdateSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    maxUsers: z.number().int().positive().nullable().optional(),
    modules: z.array(z.string().min(1)).max(100).optional(),
    notes: z.string().max(10_000).optional(),
    isCustomPricing: z.boolean().optional(),
    trialEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
    subscriptionStart: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    subscriptionEnd: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    notify: z.boolean().optional(),
  })
  .strict();
