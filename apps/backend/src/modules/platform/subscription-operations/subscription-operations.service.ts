import { AuditAction, EntityType, Plan, Prisma } from "@prisma/client";
import {
  PLAN_MODULES,
  type BillingInvoiceState,
  type BillingProvider,
  type CustomPriceRequest,
  type ModuleKey,
  type PlanChangeQuote,
  type PlanName,
  type RevenueOverview,
  type SubscriptionSnapshot,
  type SubscriptionState,
} from "@repo/types";
import { BaseError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";
import { createAuditLog } from "../../../utils/audit.js";
import {
  appModuleToModuleKey,
  modulesForPrismaPlan,
} from "../../../utils/tenant-modules.js";
import type { providerEventSchema } from "./subscription-operations.schemas.js";
import type { z } from "zod";

const PLAN_PRICES: Record<PlanName, number> = {
  STARTER: 1990,
  PROFESSIONAL: 3990,
  ENTERPRISE: 0,
};
export class SubscriptionOperationsError extends BaseError {
  constructor(message: string, status: 400 | 403 | 404 | 409 = 409) {
    super(message, status, "SUBSCRIPTION_OPERATIONS_ERROR");
  }
}
export async function syncSubscriptionForPlan(
  db: Prisma.TransactionClient,
  tenantId: string,
  plan: Plan,
): Promise<void> {
  const current = await db.billingSubscription.findFirst({
    where: { tenantId },
  });
  if (
    current?.customPricingExpiresAt &&
    current.customPricingExpiresAt > new Date()
  )
    return;
  await db.billingSubscription.upsert({
    where: { tenantId },
    create: { tenantId, state: "ACTIVE", monthlyAmount: PLAN_PRICES[plan] },
    update: {
      monthlyAmount: PLAN_PRICES[plan],
      customUnitPrice: null,
      customPricingExpiresAt: null,
    },
  });
  await db.tenant.update({
    where: { id: tenantId },
    data: { isCustomPricing: false, userPrice: null },
  });
}
const money = (value: Prisma.Decimal | number): string =>
  new Prisma.Decimal(value).toFixed(2);
const state = (value: string): SubscriptionState => {
  if (["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"].includes(value))
    return value as SubscriptionState;
  throw new SubscriptionOperationsError("Abonelik durumu bozuk.");
};
const invoiceState = (value: string): BillingInvoiceState => {
  if (["OPEN", "PAID", "FAILED", "VOID"].includes(value))
    return value as BillingInvoiceState;
  throw new SubscriptionOperationsError("Fatura durumu bozuk.");
};
const provider = (value: string): BillingProvider => {
  if (["MANUAL", "STRIPE", "IYZICO"].includes(value))
    return value as BillingProvider;
  throw new SubscriptionOperationsError("Sağlayıcı bilgisi bozuk.");
};

const readJsonString = (
  value: Prisma.JsonValue,
  key: string,
): string | null => {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    return null;
  const field = value[key];
  return typeof field === "string" ? field : null;
};

async function ensureSubscription(tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) throw new SubscriptionOperationsError("Tenant bulunamadı.", 404);
  const activeUsers = await prisma.tenantUser.count({
    where: { tenantId, isActive: true },
  });
  const monthlyAmount =
    tenant.isCustomPricing && tenant.userPrice
      ? tenant.userPrice.mul(activeUsers)
      : PLAN_PRICES[tenant.plan];
  let subscription = await prisma.billingSubscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      state: tenant.status === "TRIAL" ? "TRIALING" : "ACTIVE",
      monthlyAmount,
    },
    update: {},
  });
  if (
    subscription.customPricingExpiresAt &&
    subscription.customPricingExpiresAt <= new Date()
  ) {
    await prisma.$transaction(async (tx) =>
      syncSubscriptionForPlan(tx, tenantId, tenant.plan),
    );
    subscription = await prisma.billingSubscription.findFirstOrThrow({
      where: { tenantId },
    });
  }
  return { tenant, subscription, activeUsers };
}

export async function getSubscriptionSnapshot(
  tenantId: string,
): Promise<SubscriptionSnapshot> {
  const { tenant, subscription } = await ensureSubscription(tenantId);
  const [invoices, discount] = await Promise.all([
    prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.subscriptionDiscount.findFirst({
      where: {
        tenantId,
        expiresAt: { gt: new Date() },
        coupon: { isActive: true },
      },
      orderBy: { expiresAt: "desc" },
      include: { coupon: true },
    }),
  ]);
  const expected = PLAN_MODULES[tenant.plan];
  const actual = tenant.modules.map(appModuleToModuleKey);
  const monthly = discount
    ? subscription.monthlyAmount.mul(100 - discount.coupon.percent).div(100)
    : subscription.monthlyAmount;
  return {
    tenantId,
    provider: provider(subscription.provider),
    providerCustomerId: subscription.providerCustomerId,
    state: state(subscription.state),
    plan: tenant.plan,
    monthlyAmount: money(monthly),
    currency: subscription.currency,
    mrr: money(monthly),
    arr: money(monthly.mul(12)),
    dunningAttempt: subscription.dunningAttempt,
    nextRetryAt: subscription.nextRetryAt?.toISOString() ?? null,
    customUnitPrice: subscription.customUnitPrice?.toFixed(2) ?? null,
    customPricingExpiresAt:
      subscription.customPricingExpiresAt?.toISOString() ?? null,
    discount: discount
      ? {
          code: discount.coupon.code,
          percent: discount.coupon.percent,
          expiresAt: discount.expiresAt.toISOString(),
        }
      : null,
    invoices: invoices.map((row) => ({
      id: row.id,
      providerInvoiceId: row.providerInvoiceId,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      status: invoiceState(row.status),
      dueAt: row.dueAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      failureReason: row.failureReason,
    })),
    expectedModules: [...expected],
    actualModules: actual,
    missingModules: expected.filter((item) => !actual.includes(item)),
    extraModules: actual.filter((item) => !expected.includes(item)),
  };
}

export async function getRevenueOverview(): Promise<RevenueOverview> {
  const [subscriptions, failedInvoices, trialConversions] =
    await runWithTenantIsolationBypass("admin-console", () =>
      Promise.all([
        prisma.billingSubscription.findMany({
          where: { tenantId: { not: "" } },
          select: {
            monthlyAmount: true,
            state: true,
            tenant: {
              select: {
                subscriptionDiscounts: {
                  where: {
                    expiresAt: { gt: new Date() },
                    coupon: { isActive: true },
                  },
                  select: { coupon: { select: { percent: true } } },
                  take: 1,
                },
              },
            },
          },
        }),
        prisma.billingInvoice.count({
          where: { tenantId: { not: "" }, status: "FAILED" },
        }),
        prisma.billingProviderEvent.count({
          where: { type: "SUBSCRIPTION_ACTIVE" },
        }),
      ]),
    );
  const active = subscriptions.filter((item) => item.state === "ACTIVE");
  const mrr = active.reduce(
    (sum, item) =>
      sum.add(
        item.monthlyAmount
          .mul(
            100 - (item.tenant.subscriptionDiscounts[0]?.coupon.percent ?? 0),
          )
          .div(100),
      ),
    new Prisma.Decimal(0),
  );
  return {
    mrr: mrr.toFixed(2),
    arr: mrr.mul(12).toFixed(2),
    activeSubscriptions: active.length,
    pastDueSubscriptions: subscriptions.filter(
      (item) => item.state === "PAST_DUE",
    ).length,
    failedInvoices,
    trialConversions,
  };
}

export async function quotePlanChange(
  tenantId: string,
  toPlan: PlanName,
  effectiveAt: Date,
): Promise<PlanChangeQuote> {
  const { tenant, subscription, activeUsers } =
    await ensureSubscription(tenantId);
  const from = tenant.plan;
  const now = new Date();
  const days = Math.max(0, (effectiveAt.getTime() - now.getTime()) / 86400000);
  const fraction = Math.min(1, days / 30);
  const next = PLAN_PRICES[toPlan];
  const currentModules = PLAN_MODULES[from];
  const nextModules = PLAN_MODULES[toPlan];
  return {
    fromPlan: from,
    toPlan,
    activeUsers,
    currentMonthly: subscription.monthlyAmount.toFixed(2),
    nextMonthly: money(next),
    proratedAmount: money(
      (next - subscription.monthlyAmount.toNumber()) * (1 - fraction),
    ),
    currency: subscription.currency,
    effectiveAt: effectiveAt.toISOString(),
    moduleChanges: {
      added: nextModules.filter((item) => !currentModules.includes(item)),
      removed: currentModules.filter((item) => !nextModules.includes(item)),
    },
  };
}

export async function reconcileEntitlements(
  tenantId: string,
  adminId: string,
): Promise<SubscriptionSnapshot> {
  const { tenant } = await ensureSubscription(tenantId);
  const expected = modulesForPrismaPlan(tenant.plan);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { modules: expected },
  });
  await createAuditLog(prisma, {
    tenantId,
    adminId,
    module: "SUBSCRIPTION",
    entityType: EntityType.OTHER,
    entityId: tenantId,
    action: AuditAction.UPDATE,
    oldValues: { modules: tenant.modules },
    newValues: { modules: expected, reconciliation: true },
  });
  return getSubscriptionSnapshot(tenantId);
}

export async function ingestProviderEvent(
  input: z.infer<typeof providerEventSchema>,
  adminId: string,
): Promise<void> {
  await ensureSubscription(input.tenantId);
  await prisma.$transaction(async (tx) => {
    const payload: Prisma.InputJsonObject = {
      tenantId: input.tenantId,
      type: input.type,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.providerInvoiceId
        ? { providerInvoiceId: input.providerInvoiceId }
        : {}),
    };
    const exists = await tx.billingProviderEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: input.provider,
          providerEventId: input.providerEventId,
        },
      },
    });
    if (exists) {
      const recordedTenantId = readJsonString(exists.payload, "tenantId");
      if (recordedTenantId !== input.tenantId || exists.type !== input.type)
        throw new SubscriptionOperationsError(
          "Sağlayıcı olay kimliği farklı bir işlem için daha önce kullanılmış.",
          409,
        );
      return;
    }
    await tx.billingProviderEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        type: input.type,
        payload,
      },
    });
    if (input.type.startsWith("SUBSCRIPTION_"))
      await tx.billingSubscription.update({
        where: { tenantId: input.tenantId },
        data: {
          provider: input.provider,
          providerCustomerId: input.providerCustomerId,
          state: input.type === "SUBSCRIPTION_ACTIVE" ? "ACTIVE" : "CANCELED",
          ...(input.amount !== undefined
            ? { monthlyAmount: input.amount }
            : {}),
        },
      });
    else {
      if (!input.providerInvoiceId || input.amount === undefined)
        throw new SubscriptionOperationsError(
          "Fatura olayında invoice id ve tutar zorunlu.",
          400,
        );
      const status: BillingInvoiceState =
        input.type === "INVOICE_PAID"
          ? "PAID"
          : input.type === "INVOICE_FAILED"
            ? "FAILED"
            : "OPEN";
      const existingInvoice = await tx.billingInvoice.findFirst({
        where: {
          tenantId: input.tenantId,
          providerInvoiceId: input.providerInvoiceId,
        },
      });
      if (existingInvoice) {
        await tx.billingInvoice.updateMany({
          where: { id: existingInvoice.id, tenantId: input.tenantId },
          data: {
            status,
            paidAt: status === "PAID" ? new Date() : undefined,
            failureReason: input.failureReason,
          },
        });
      } else {
        await tx.billingInvoice.create({
          data: {
            tenantId: input.tenantId,
            providerInvoiceId: input.providerInvoiceId,
            amount: input.amount,
            currency: input.currency,
            status,
            dueAt: input.dueAt ? new Date(input.dueAt) : new Date(),
            paidAt: status === "PAID" ? new Date() : null,
            failureReason: input.failureReason,
          },
        });
      }
      await tx.billingSubscription.update({
        where: { tenantId: input.tenantId },
        data:
          status === "FAILED"
            ? {
                state: "PAST_DUE",
                dunningAttempt: { increment: 1 },
                nextRetryAt: new Date(Date.now() + 3 * 86400000),
              }
            : status === "PAID"
              ? { state: "ACTIVE", dunningAttempt: 0, nextRetryAt: null }
              : {},
      });
    }
    await createAuditLog(tx, {
      tenantId: input.tenantId,
      adminId,
      module: "SUBSCRIPTION",
      entityType: EntityType.OTHER,
      entityId: input.providerEventId,
      action: AuditAction.UPDATE,
      newValues: { provider: input.provider, type: input.type },
    });
  });
}

export async function createCoupon(input: {
  code: string;
  percent: number;
  expiresAt: Date;
  maxRedemptions?: number;
}) {
  return prisma.billingCoupon.create({ data: input });
}
export async function applyCoupon(
  tenantId: string,
  code: string,
  adminId: string,
): Promise<SubscriptionSnapshot> {
  const coupon = await prisma.billingCoupon.findFirst({
    where: { code, isActive: true, expiresAt: { gt: new Date() } },
  });
  const alreadyApplied = coupon
    ? await prisma.subscriptionDiscount.findFirst({
        where: { tenantId, couponId: coupon.id },
      })
    : null;
  if (alreadyApplied) return getSubscriptionSnapshot(tenantId);
  if (
    !coupon ||
    (coupon.maxRedemptions !== null &&
      coupon.redemptionCount >= coupon.maxRedemptions)
  )
    throw new SubscriptionOperationsError(
      "Kupon geçersiz veya kullanım limiti dolmuş.",
      400,
    );
  await prisma.$transaction(async (tx) => {
    const existing = await tx.subscriptionDiscount.findFirst({
      where: { tenantId, couponId: coupon.id },
    });
    if (existing) return;
    await tx.subscriptionDiscount.create({
      data: { tenantId, couponId: coupon.id, expiresAt: coupon.expiresAt },
    });
    await tx.billingCoupon.update({
      where: { id: coupon.id },
      data: { redemptionCount: { increment: 1 } },
    });
    await createAuditLog(tx, {
      tenantId,
      adminId,
      module: "SUBSCRIPTION",
      entityType: EntityType.OTHER,
      entityId: coupon.id,
      action: AuditAction.UPDATE,
      newValues: { coupon: code, percent: coupon.percent },
    });
  });
  return getSubscriptionSnapshot(tenantId);
}

const custom = (row: {
  id: string;
  state: string;
  monthlyAmount: Prisma.Decimal;
  unitPrice: Prisma.Decimal | null;
  expiresAt: Date;
  reason: string;
  requestedById: string;
  decidedById: string | null;
  createdAt: Date;
}): CustomPriceRequest => ({
  id: row.id,
  state: row.state as CustomPriceRequest["state"],
  monthlyAmount: row.monthlyAmount.toFixed(2),
  unitPrice: row.unitPrice?.toFixed(2) ?? null,
  expiresAt: row.expiresAt.toISOString(),
  reason: row.reason,
  requestedById: row.requestedById,
  decidedById: row.decidedById,
  createdAt: row.createdAt.toISOString(),
});
export async function requestCustomPrice(
  tenantId: string,
  adminId: string,
  input: {
    monthlyAmount: number;
    unitPrice?: number | null;
    expiresAt: Date;
    reason: string;
  },
): Promise<CustomPriceRequest> {
  if (input.expiresAt <= new Date())
    throw new SubscriptionOperationsError(
      "Özel fiyat bitiş tarihi gelecekte olmalı.",
      400,
    );
  await ensureSubscription(tenantId);
  return custom(
    await prisma.customPriceRequest.create({
      data: { tenantId, requestedById: adminId, ...input },
    }),
  );
}
export async function decideCustomPrice(
  tenantId: string,
  id: string,
  adminId: string,
  decision: "approve" | "reject",
): Promise<CustomPriceRequest> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.customPriceRequest.findFirst({
      where: { id, tenantId, state: "PENDING" },
    });
    if (!row)
      throw new SubscriptionOperationsError(
        "Bekleyen özel fiyat talebi bulunamadı.",
        404,
      );
    if (row.requestedById === adminId)
      throw new SubscriptionOperationsError(
        "Kendi özel fiyat talebinizi onaylayamazsınız.",
        403,
      );
    const requester = await tx.adminUser.findFirst({
      where: {
        id: row.requestedById,
        isActive: true,
        roleAssignments: {
          some: {
            adminRole: {
              permissions: {
                some: { adminPermission: { key: "tenant.plan.update" } },
              },
            },
          },
        },
      },
    });
    if (!requester)
      throw new SubscriptionOperationsError(
        "Talep eden adminin fiyat yetkisi artık geçerli değil.",
        403,
      );
    const claimed = await tx.customPriceRequest.updateMany({
      where: { id, tenantId, state: "PENDING" },
      data: {
        state: decision === "approve" ? "APPLIED" : "REJECTED",
        decidedById: adminId,
        decidedAt: new Date(),
      },
    });
    if (claimed.count !== 1)
      throw new SubscriptionOperationsError(
        "Özel fiyat talebi eşzamanlı olarak işlendi.",
      );
    if (decision === "approve") {
      await tx.billingSubscription.update({
        where: { tenantId },
        data: {
          monthlyAmount: row.monthlyAmount,
          customUnitPrice: row.unitPrice,
          customPricingExpiresAt: row.expiresAt,
        },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { isCustomPricing: true, userPrice: row.unitPrice },
      });
    }
    await createAuditLog(tx, {
      tenantId,
      adminId,
      module: "SUBSCRIPTION",
      entityType: EntityType.OTHER,
      entityId: id,
      action: decision === "approve" ? AuditAction.APPROVE : AuditAction.REJECT,
      reason: row.reason,
      newValues: {
        monthlyAmount: row.monthlyAmount.toFixed(2),
        expiresAt: row.expiresAt.toISOString(),
      },
    });
    return custom(
      await tx.customPriceRequest.findFirstOrThrow({ where: { id, tenantId } }),
    );
  });
}
export async function listCustomPrices(
  tenantId: string,
): Promise<CustomPriceRequest[]> {
  return (
    await prisma.customPriceRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  ).map(custom);
}
