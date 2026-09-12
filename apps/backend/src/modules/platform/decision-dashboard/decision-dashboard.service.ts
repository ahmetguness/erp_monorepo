import type {
  AdminDashboardRangeDays,
  AdminDecisionDashboard,
  AdminDecisionMetric,
  AdminPermission,
} from "@repo/types";
import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";
import { getPersistentDashboard } from "../persistent-observability/persistent-observability.service.js";

const DAY_MS = 86_400_000;

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

function metric(
  input: Omit<AdminDecisionMetric, "changePercent">,
): AdminDecisionMetric {
  return {
    ...input,
    changePercent:
      input.previousValue === null
        ? null
        : percentageChange(input.value, input.previousValue),
  };
}

export async function getAdminDecisionDashboard(
  rangeDays: AdminDashboardRangeDays,
  permissions: readonly AdminPermission[],
): Promise<AdminDecisionDashboard> {
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays * DAY_MS);
  const previousFrom = new Date(from.getTime() - rangeDays * DAY_MS);
  const inactivityCutoff = new Date(to.getTime() - 30 * DAY_MS);
  const subscriptionRiskHorizon = new Date(to.getTime() + 30 * DAY_MS);

  const canReadOperations = permissions.includes("operations.read");
  const canReadApprovals = permissions.includes("change-request.read");
  const data = await runWithTenantIsolationBypass("admin-console", async () => {
    const [
      currentActivity,
      previousActivity,
      currentTrialCohort,
      previousTrialCohort,
      currentConversions,
      previousConversions,
      recentActivity,
      subscriptions,
      openIncidents,
      pendingApprovals,
      observability,
    ] = await Promise.all([
      prisma.auditLog.findMany({
        where: { createdAt: { gte: from, lt: to }, adminId: null },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      prisma.auditLog.findMany({
        where: { createdAt: { gte: previousFrom, lt: from }, adminId: null },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      prisma.tenant.count({
        where: {
          deletedAt: null,
          createdAt: { gte: from, lt: to },
          status: { in: ["TRIAL", "ACTIVE"] },
        },
      }),
      prisma.tenant.count({
        where: {
          deletedAt: null,
          createdAt: { gte: previousFrom, lt: from },
          status: { in: ["TRIAL", "ACTIVE"] },
        },
      }),
      prisma.tenant.count({
        where: {
          deletedAt: null,
          createdAt: { gte: from, lt: to },
          status: "ACTIVE",
          subscriptionStart: { not: null },
        },
      }),
      prisma.tenant.count({
        where: {
          deletedAt: null,
          createdAt: { gte: previousFrom, lt: from },
          status: "ACTIVE",
          subscriptionStart: { not: null },
        },
      }),
      prisma.auditLog.findMany({
        where: { createdAt: { gte: inactivityCutoff }, adminId: null },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      prisma.billingSubscription.findMany({
        where: { state: "ACTIVE" },
        select: { monthlyAmount: true, currency: true, createdAt: true },
      }),
      canReadOperations
        ? prisma.platformIncident.count({
            where: { status: { not: "RESOLVED" } },
          })
        : Promise.resolve(null),
      canReadApprovals
        ? prisma.adminChangeRequest.count({ where: { status: "PENDING" } })
        : Promise.resolve(null),
      canReadOperations
        ? getPersistentDashboard(rangeDays === 7 ? "7d" : "30d")
        : Promise.resolve(null),
    ]);
    const churnRisk = await prisma.tenant.count({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { id: { notIn: recentActivity.map((item) => item.tenantId) } },
          { subscriptionEnd: { gte: to, lte: subscriptionRiskHorizon } },
          { billingSubscription: { is: { dunningAttempt: { gt: 0 } } } },
        ],
      },
    });
    return {
      currentActivity,
      previousActivity,
      currentTrialCohort,
      previousTrialCohort,
      currentConversions,
      previousConversions,
      subscriptions,
      openIncidents,
      pendingApprovals,
      observability,
      churnRisk,
    };
  });

  const conversion = data.currentTrialCohort
    ? (data.currentConversions / data.currentTrialCohort) * 100
    : 0;
  const previousConversion = data.previousTrialCohort
    ? (data.previousConversions / data.previousTrialCohort) * 100
    : 0;
  const currency = data.subscriptions.some((item) => item.currency === "TRY")
    ? "TRY"
    : (data.subscriptions[0]?.currency ?? "TRY");
  const revenueSubscriptions = data.subscriptions.filter(
    (item) => item.currency === currency,
  );
  const mrr = revenueSubscriptions.reduce(
    (sum, item) => sum + item.monthlyAmount.toNumber(),
    0,
  );
  const previousMrr = revenueSubscriptions
    .filter((item) => item.createdAt < from)
    .reduce((sum, item) => sum + item.monthlyAmount.toNumber(), 0);
  const observedBudgets =
    data.observability?.slos
      .filter((item) => item.sampleCount > 0)
      .map((item) => item.errorBudgetRemainingPercentage) ?? [];
  const errorBudget = observedBudgets.length
    ? Math.min(...observedBudgets)
    : 100;
  const metrics: AdminDecisionMetric[] = [
    metric({
      key: "ACTIVE_USAGE",
      label: "Aktif kullanım",
      value: data.currentActivity.length,
      previousValue: data.previousActivity.length,
      format: "NUMBER",
      currency: null,
      tone:
        data.currentActivity.length >= data.previousActivity.length
          ? "POSITIVE"
          : "WARNING",
      href: "/admin/tenants?status=ACTIVE",
      detail: "Dönemde kullanıcı işlemi üreten benzersiz tenant",
    }),
    metric({
      key: "TRIAL_CONVERSION",
      label: "Trial dönüşümü",
      value: Math.round(conversion * 100) / 100,
      previousValue: Math.round(previousConversion * 100) / 100,
      format: "PERCENT",
      currency: null,
      tone: conversion >= previousConversion ? "POSITIVE" : "WARNING",
      href: "/admin/tenants?status=TRIAL",
      detail: `${data.currentConversions}/${data.currentTrialCohort} dönem kohortu aktif aboneliğe geçti`,
    }),
    metric({
      key: "CHURN_RISK",
      label: "Churn riski",
      value: data.churnRisk,
      previousValue: null,
      format: "NUMBER",
      currency: null,
      tone: data.churnRisk > 0 ? "WARNING" : "POSITIVE",
      href: "/admin/tenants?status=ACTIVE",
      detail: "30 gün hareketsiz, tahsilat riski veya abonelik bitişi yaklaşan",
    }),
    metric({
      key: "MRR",
      label: "MRR",
      value: mrr,
      previousValue: previousMrr,
      format: "CURRENCY",
      currency,
      tone: mrr >= previousMrr ? "POSITIVE" : "CRITICAL",
      href: "/admin/tenants?status=ACTIVE",
      detail: "Aktif aboneliklerin aylık tekrarlayan geliri",
    }),
    metric({
      key: "ARR",
      label: "ARR",
      value: mrr * 12,
      previousValue: previousMrr * 12,
      format: "CURRENCY",
      currency,
      tone: mrr >= previousMrr ? "POSITIVE" : "CRITICAL",
      href: "/admin/tenants?status=ACTIVE",
      detail: "MRR × 12 yıllıklandırılmış gelir",
    }),
    ...(data.observability && data.openIncidents !== null
      ? [
          metric({
            key: "ERROR_BUDGET",
            label: "Hata bütçesi",
            value: errorBudget,
            previousValue: null,
            format: "PERCENT",
            currency: null,
            tone:
              errorBudget < 25
                ? "CRITICAL"
                : errorBudget < 50
                  ? "WARNING"
                  : "POSITIVE",
            href: "/admin/observability?tab=historical",
            detail: "Örnekli SLO'lar arasındaki en düşük kalan bütçe",
          }),
          metric({
            key: "OPEN_INCIDENTS",
            label: "Açık olay",
            value: data.openIncidents,
            previousValue: null,
            format: "NUMBER",
            currency: null,
            tone: data.openIncidents > 0 ? "CRITICAL" : "POSITIVE",
            href: "/admin/observability?tab=historical",
            detail: "Çözümlenmemiş platform olayları",
          }),
        ]
      : []),
    ...(data.pendingApprovals !== null
      ? [
          metric({
            key: "PENDING_APPROVALS",
            label: "Bekleyen onay",
            value: data.pendingApprovals,
            previousValue: null,
            format: "NUMBER",
            currency: null,
            tone: data.pendingApprovals > 0 ? "WARNING" : "POSITIVE",
            href: "/admin/change-requests?status=PENDING",
            detail: "İkinci yönetici kararı bekleyen değişiklikler",
          }),
        ]
      : []),
  ];
  return {
    rangeDays,
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      previousFrom: previousFrom.toISOString(),
      previousTo: from.toISOString(),
    },
    metrics,
    generatedAt: to.toISOString(),
    dataNotes: [
      "Aktif kullanım audit kaydı üreten kullanıcı işlemlerinden hesaplanır.",
      `MRR/ARR ${currency} para birimindeki aktif abonelikleri gösterir.`,
      "Geçmiş MRR karşılaştırması mevcut aktif aboneliklerin başlangıç tarihine dayalı yaklaşık değerdir.",
    ],
  };
}
