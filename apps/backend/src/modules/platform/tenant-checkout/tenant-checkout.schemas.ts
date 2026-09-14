import { z } from 'zod';
export const checkoutQuoteSchema = z.object({ plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']), billing: z.enum(['monthly', 'annual']), couponCode: z.string().trim().min(3).max(40).optional() }).strict();
export const completeCheckoutSchema = checkoutQuoteSchema.extend({ paymentMethod: z.enum(['card', 'bank']), idempotencyKey: z.string().uuid() }).strict();
