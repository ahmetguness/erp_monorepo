import type { Context } from 'hono';
import { ValidationError } from '../../../../../errors/index.js';
import { requireParam } from '../../../../../utils/context.js';
import { applyCouponSchema, couponSchema, customPriceSchema, decisionSchema, providerEventSchema, quoteSchema } from '../../../subscription-operations/subscription-operations.schemas.js';
import { applyCoupon, createCoupon, deactivateCoupon, decideCustomPrice, getRevenueOverview, getSubscriptionSnapshot, ingestProviderEvent, listCoupons, listCustomPrices, quotePlanChange, reconcileEntitlements, requestCustomPrice } from '../../../subscription-operations/subscription-operations.service.js';

async function body(c: Context): Promise<unknown> { return c.req.json<unknown>().catch(() => null); }
function parse<T>(result: { success: true; data: T } | { success: false }): T { if (!result.success) throw new ValidationError('Abonelik operasyonu verileri geçersiz.'); return result.data; }

export const AdminSubscriptionOperationsController = {
  async overview(c: Context) { c.header('Cache-Control', 'no-store'); return c.json({ data: await getRevenueOverview() }); },
  async get(c: Context) { c.header('Cache-Control', 'no-store'); const tenantId = requireParam(c, 'id'); return c.json({ data: { snapshot: await getSubscriptionSnapshot(tenantId), customPrices: await listCustomPrices(tenantId) } }); },
  async quote(c: Context) { const input = parse(quoteSchema.safeParse(await body(c))); return c.json({ data: await quotePlanChange(requireParam(c, 'id'), input.toPlan, new Date(input.effectiveAt)) }); },
  async event(c: Context) { const input = parse(providerEventSchema.safeParse(await body(c))); await ingestProviderEvent(input, c.get('adminId')); return c.json({ data: { success: true } }, 202); },
  async listCoupons(c: Context) {
    const { plan, isActive } = c.req.query();
    const opts = {
      ...(plan ? { plan } : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    };
    return c.json({ data: await listCoupons(opts) });
  },
  async coupon(c: Context) { const input = parse(couponSchema.safeParse(await body(c))); return c.json({ data: await createCoupon({ ...input, expiresAt: new Date(input.expiresAt) }) }, 201); },
  async deactivateCoupon(c: Context) { await deactivateCoupon(requireParam(c, 'id')); return c.json({ data: { success: true } }); },
  async applyCoupon(c: Context) { const input = parse(applyCouponSchema.safeParse(await body(c))); return c.json({ data: await applyCoupon(requireParam(c, 'id'), input.code, c.get('adminId')) }); },
  async reconcile(c: Context) { return c.json({ data: await reconcileEntitlements(requireParam(c, 'id'), c.get('adminId')) }); },
  async requestPrice(c: Context) { const input = parse(customPriceSchema.safeParse(await body(c))); return c.json({ data: await requestCustomPrice(requireParam(c, 'id'), c.get('adminId'), { ...input, expiresAt: new Date(input.expiresAt) }) }, 202); },
  async decidePrice(c: Context) { const input = parse(decisionSchema.safeParse(await body(c))); return c.json({ data: await decideCustomPrice(requireParam(c, 'id'), requireParam(c, 'requestId'), c.get('adminId'), input.decision) }); },
};
