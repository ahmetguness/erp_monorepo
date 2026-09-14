import { Plan, Prisma } from '@prisma/client';
import type { CompleteTenantCheckoutInput, TenantCheckoutContext, TenantCheckoutQuote, TenantCheckoutReceipt } from '@repo/types';
import type { PlanName } from '@repo/types/plans';
import { prisma } from '../../../lib/prisma.js';
import { ForbiddenError, ValidationError } from '../../../errors/index.js';
import { modulesForPrismaPlan } from '../../../utils/tenant-modules.js';

const MONTHLY_PRICE: Record<Plan, number> = { STARTER: 2450, PROFESSIONAL: 5950, ENTERPRISE: 14900 };
const ANNUAL_PRICE: Record<Plan, number> = { STARTER: 23400, PROFESSIONAL: 57000, ENTERPRISE: 142800 };
const addMonths = (date: Date, months: number) => { const result = new Date(date); result.setUTCMonth(result.getUTCMonth() + months); return result; };
function toPrismaPlan(plan: PlanName): Plan { switch (plan) { case 'STARTER': return Plan.STARTER; case 'PROFESSIONAL': return Plan.PROFESSIONAL; case 'ENTERPRISE': return Plan.ENTERPRISE; } }
async function assertOwner(tenantId: string, userId: string): Promise<void> { const owner = await prisma.tenantUser.findFirst({ where: { tenantId, userId, isOwner: true, isActive: true }, select: { id: true } }); if (!owner) throw new ForbiddenError('Abonelik işlemini yalnızca şirket sahibi yapabilir.'); }

export async function getTenantCheckoutContext(tenantId: string, userId: string): Promise<TenantCheckoutContext> {
  await assertOwner(tenantId, userId);
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true, companyName: true, plan: true, status: true, trialEndsAt: true, subscriptionEnd: true,
        taxOffice: true, taxNumber: true, email: true, phone: true, address: true, city: true, country: true,
      },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } }),
  ]);
  return {
    tenantId: tenant.id,
    companyName: tenant.companyName,
    currentPlan: tenant.plan,
    status: tenant.status,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    subscriptionEnd: tenant.subscriptionEnd?.toISOString() ?? null,
    isOwner: true,
    billingProfile: {
      taxOffice: tenant.taxOffice,
      taxNumber: tenant.taxNumber,
      email: tenant.email,
      phone: tenant.phone,
      address: tenant.address,
      city: tenant.city,
      country: tenant.country,
    },
    contact: { name: user.name, email: user.email, phone: user.phone },
  };
}
async function quote(plan: Plan, billing: 'monthly' | 'annual', couponCode?: string): Promise<TenantCheckoutQuote> {
  const months = billing === 'annual' ? 12 : 1;
  const subtotal = billing === 'annual' ? ANNUAL_PRICE[plan] : MONTHLY_PRICE[plan];
  const coupon = couponCode ? await prisma.billingCoupon.findFirst({ where: { code: couponCode.trim().toUpperCase(), isActive: true, expiresAt: { gt: new Date() }, OR: [{ plan: null }, { plan }] }, select: { code: true, percent: true, maxRedemptions: true, redemptionCount: true } }) : null;
  if (couponCode && (!coupon || (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions))) throw new ValidationError('Kupon geçersiz, bu plana uygun değil veya kullanım limiti dolmuş.');
  const discount = coupon ? Math.round(subtotal * coupon.percent / 100) : 0; const tax = Math.round((subtotal - discount) * 0.2);
  return { plan, billing, months, subtotal, discount, tax, total: subtotal - discount + tax, currency: 'TRY', coupon: coupon ? { code: coupon.code, percent: coupon.percent } : null };
}
export async function quoteTenantCheckout(tenantId: string, userId: string, input: { plan: Plan; billing: 'monthly' | 'annual'; couponCode?: string }): Promise<TenantCheckoutQuote> { await assertOwner(tenantId, userId); return quote(input.plan, input.billing, input.couponCode); }

export async function completeTenantCheckout(tenantId: string, userId: string, input: CompleteTenantCheckoutInput): Promise<TenantCheckoutReceipt> {
  await assertOwner(tenantId, userId); const plan = toPrismaPlan(input.plan); const calculated = await quote(plan, input.billing, input.couponCode);
  if (process.env.NODE_ENV === 'production' && input.paymentMethod === 'card') throw new ValidationError('Kartlı ödeme sağlayıcısı yapılandırılmadan ödeme tamamlanamaz.');
  return prisma.$transaction(async (tx) => {
    const prior = await tx.billingInvoice.findFirst({ where: { tenantId, providerInvoiceId: input.idempotencyKey } });
    if (prior) return { invoiceId: prior.id, status: prior.status as 'PAID' | 'OPEN', activated: prior.status === 'PAID', subscriptionEnd: (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).subscriptionEnd?.toISOString() ?? null, quote: calculated };
    const paid = input.paymentMethod === 'card' && process.env.NODE_ENV !== 'production'; const now = new Date(); const end = paid ? addMonths(now, calculated.months) : null;
    if (paid && calculated.coupon) {
      const alreadyUsed = await tx.subscriptionDiscount.findUnique({ where: { tenantId_couponId: { tenantId, couponId: (await tx.billingCoupon.findUniqueOrThrow({ where: { code: calculated.coupon.code }, select: { id: true } })).id } }, select: { id: true } });
      if (alreadyUsed) throw new ValidationError('Bu kupon şirketiniz tarafından daha önce kullanılmış.');
      const claimed = await tx.billingCoupon.updateMany({ where: { code: calculated.coupon.code, isActive: true, expiresAt: { gt: now }, OR: [{ maxRedemptions: null }, { redemptionCount: { lt: await couponLimit(tx, calculated.coupon.code) } }] }, data: { redemptionCount: { increment: 1 } } });
      if (claimed.count !== 1) throw new ValidationError('Kupon kullanım limiti dolmuş.');
      const claimedCoupon = await tx.billingCoupon.findUniqueOrThrow({ where: { code: calculated.coupon.code }, select: { id: true } });
      await tx.subscriptionDiscount.create({ data: { tenantId, couponId: claimedCoupon.id, expiresAt: end ?? now } });
    }
    const invoice = await tx.billingInvoice.create({ data: { tenantId, providerInvoiceId: input.idempotencyKey, amount: new Prisma.Decimal(calculated.total), status: paid ? 'PAID' : 'OPEN', dueAt: now, paidAt: paid ? now : null } });
    if (paid && end) { await tx.tenant.update({ where: { id: tenantId }, data: { plan, status: 'ACTIVE', trialEndsAt: null, subscriptionStart: now, subscriptionEnd: end, planChangedAt: now, modules: modulesForPrismaPlan(plan) } }); await tx.billingSubscription.upsert({ where: { tenantId }, create: { tenantId, state: 'ACTIVE', monthlyAmount: MONTHLY_PRICE[plan] }, update: { state: 'ACTIVE', monthlyAmount: MONTHLY_PRICE[plan], dunningAttempt: 0, nextRetryAt: null } }); }
    return { invoiceId: invoice.id, status: paid ? 'PAID' : 'OPEN', activated: paid, subscriptionEnd: end?.toISOString() ?? null, quote: calculated };
  });
}
async function couponLimit(tx: Prisma.TransactionClient, code: string): Promise<number> { return (await tx.billingCoupon.findUniqueOrThrow({ where: { code }, select: { maxRedemptions: true } })).maxRedemptions ?? Number.MAX_SAFE_INTEGER; }
