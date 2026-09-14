import { Hono } from 'hono';
import { z } from 'zod';
import { validateCheckoutCoupon } from '../modules/platform/subscription-operations/subscription-operations.service.js';

const paramsSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Z0-9_-]+$/i),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
});

export const checkoutPublicRoutes = new Hono();

checkoutPublicRoutes.get('/checkout/coupons/:code', async (c) => {
  const parsed = paramsSchema.safeParse({ code: c.req.param('code'), plan: c.req.query('plan') });
  if (!parsed.success) return c.json({ data: { valid: false } });
  const coupon = await validateCheckoutCoupon(parsed.data.code, parsed.data.plan);
  return c.json({ data: coupon ? { valid: true, coupon } : { valid: false } });
});
