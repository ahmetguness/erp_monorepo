import { z } from "zod";
import { PLAN } from "@repo/types/plans";

export const quoteSchema = z
  .object({
    toPlan: z.enum([PLAN.STARTER, PLAN.PROFESSIONAL, PLAN.ENTERPRISE]),
    effectiveAt: z.string().datetime(),
  })
  .strict();
export const providerEventSchema = z
  .object({
    provider: z.enum(["MANUAL", "STRIPE", "IYZICO"]),
    providerEventId: z.string().min(3).max(160),
    tenantId: z.string().min(1),
    type: z.enum([
      "SUBSCRIPTION_ACTIVE",
      "SUBSCRIPTION_CANCELED",
      "INVOICE_OPEN",
      "INVOICE_PAID",
      "INVOICE_FAILED",
    ]),
    providerCustomerId: z.string().max(160).optional(),
    providerInvoiceId: z.string().max(160).optional(),
    amount: z.number().nonnegative().optional(),
    currency: z.string().length(3).default("TRY"),
    dueAt: z.string().datetime().optional(),
    failureReason: z.string().max(500).optional(),
  })
  .strict();
export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/),
    percent: z.number().int().min(1).max(100),
    expiresAt: z.string().datetime(),
    maxRedemptions: z.number().int().positive().optional(),
    plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']).nullable().optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();
export const applyCouponSchema = z
  .object({ code: z.string().trim().toUpperCase().min(3).max(40) })
  .strict();
export const customPriceSchema = z
  .object({
    monthlyAmount: z.number().positive(),
    unitPrice: z.number().positive().nullable().optional(),
    expiresAt: z.string().datetime(),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
export const decisionSchema = z
  .object({ decision: z.enum(["approve", "reject"]) })
  .strict();
