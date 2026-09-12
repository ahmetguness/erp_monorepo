import type {
  AdminGlobalSearchResponse,
  AdminGlobalSearchResult,
  AdminPermission,
} from "@repo/types";
import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";

const SOURCE_LIMIT = 5;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

function allowed(
  permissions: readonly AdminPermission[],
  permission: AdminPermission,
): boolean {
  return permissions.includes(permission);
}

export async function searchAdminResources(
  query: string,
  permissions: readonly AdminPermission[],
): Promise<AdminGlobalSearchResponse> {
  const q = query.trim();
  const canReadTenants = allowed(permissions, "tenant.read");
  const canReadOperations = allowed(permissions, "operations.read");
  const canReadTickets = allowed(permissions, "support-ticket.read");
  const canReadAudit = allowed(permissions, "audit.read");

  const [tenants, users, invoices, integrations, jobs, logs, tickets] =
    await runWithTenantIsolationBypass("admin-console", () =>
      Promise.all([
        canReadTenants
          ? prisma.tenant.findMany({
              where: {
                OR: [
                  { id: { contains: q, mode: "insensitive" } },
                  { companyName: { contains: q, mode: "insensitive" } },
                  { slug: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
              select: {
                id: true,
                companyName: true,
                slug: true,
                email: true,
                status: true,
              },
              take: SOURCE_LIMIT,
            })
          : [],
        canReadTenants
          ? prisma.user.findMany({
              where: {
                OR: [
                  { id: { contains: q, mode: "insensitive" } },
                  { name: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
                tenants: { some: {} },
              },
              select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
                tenants: { select: { tenantId: true }, take: 1 },
              },
              take: SOURCE_LIMIT,
            })
          : [],
        canReadTenants
          ? prisma.billingInvoice.findMany({
              where: {
                OR: [
                  { id: { contains: q, mode: "insensitive" } },
                  { providerInvoiceId: { contains: q, mode: "insensitive" } },
                ],
              },
              select: {
                id: true,
                tenantId: true,
                amount: true,
                currency: true,
                status: true,
              },
              take: SOURCE_LIMIT,
            })
          : [],
        canReadOperations
          ? prisma.marketplaceIntegration.findMany({
              where: {
                OR: [
                  { id: { contains: q, mode: "insensitive" } },
                  { name: { contains: q, mode: "insensitive" } },
                  { storeId: { contains: q, mode: "insensitive" } },
                ],
              },
              select: {
                id: true,
                tenantId: true,
                name: true,
                channel: true,
                isActive: true,
              },
              take: SOURCE_LIMIT,
            })
          : [],
        canReadOperations
          ? prisma.marketplaceSyncJob.findMany({
              where: {
                OR: [
                  { id: { contains: q, mode: "insensitive" } },
                  { integrationId: { contains: q, mode: "insensitive" } },
                ],
              },
              select: { id: true, tenantId: true, jobType: true, status: true },
              take: SOURCE_LIMIT,
            })
          : [],
        canReadOperations || canReadAudit
          ? prisma.observabilityLogEntry.findMany({
              where: {
                OR: [
                  { requestId: { contains: q, mode: "insensitive" } },
                  { correlationId: { contains: q, mode: "insensitive" } },
                ],
              },
              select: {
                id: true,
                requestId: true,
                correlationId: true,
                service: true,
                level: true,
              },
              take: SOURCE_LIMIT,
            })
          : [],
        canReadTickets
          ? prisma.platformSupportTicket.findMany({
              where: {
                OR: [
                  { id: { contains: q, mode: "insensitive" } },
                  { ticketNumber: { contains: q, mode: "insensitive" } },
                  { title: { contains: q, mode: "insensitive" } },
                ],
              },
              select: {
                id: true,
                tenantId: true,
                ticketNumber: true,
                title: true,
                status: true,
              },
              take: SOURCE_LIMIT,
            })
          : [],
      ]),
    );

  const results: AdminGlobalSearchResult[] = [
    ...tenants.map((item) => ({
      id: item.id,
      kind: "TENANT" as const,
      title: item.companyName,
      subtitle: `${item.slug} · ${maskEmail(item.email)}`,
      tenantId: item.id,
      href: `/admin/tenants/${item.id}`,
      status: item.status,
    })),
    ...users.map((item) => ({
      id: item.id,
      kind: "USER" as const,
      title: item.name,
      subtitle: maskEmail(item.email),
      tenantId: item.tenants[0]?.tenantId ?? null,
      href: item.tenants[0]
        ? `/admin/tenants/${item.tenants[0].tenantId}?tab=${encodeURIComponent("Güvenlik")}`
        : "/admin/tenants",
      status: item.isActive ? "ACTIVE" : "INACTIVE",
    })),
    ...invoices.map((item) => ({
      id: item.id,
      kind: "INVOICE" as const,
      title: `Fatura ${item.id.slice(-8)}`,
      subtitle: `${item.amount.toString()} ${item.currency}`,
      tenantId: item.tenantId,
      href: `/admin/tenants/${item.tenantId}/subscription`,
      status: item.status,
    })),
    ...integrations.map((item) => ({
      id: item.id,
      kind: "INTEGRATION" as const,
      title: item.name,
      subtitle: item.channel,
      tenantId: item.tenantId,
      href: `/admin/tenants/${item.tenantId}?tab=${encodeURIComponent("Entegrasyonlar")}`,
      status: item.isActive ? "ACTIVE" : "INACTIVE",
    })),
    ...jobs.map((item) => ({
      id: item.id,
      kind: "JOB" as const,
      title: item.jobType,
      subtitle: `Job ${item.id.slice(-10)}`,
      tenantId: item.tenantId,
      href: `/admin/tenants/${item.tenantId}?tab=${encodeURIComponent("Operasyon")}`,
      status: item.status,
    })),
    ...logs.map((item) => ({
      id: item.id,
      kind: "REQUEST" as const,
      title: item.service,
      subtitle: item.requestId ?? item.correlationId ?? "Maskelenmiş istek",
      tenantId: null,
      href: `/admin/observability?query=${encodeURIComponent(item.requestId ?? item.correlationId ?? "")}`,
      status: item.level,
    })),
    ...tickets.map((item) => ({
      id: item.id,
      kind: "TICKET" as const,
      title: item.ticketNumber,
      subtitle: item.title,
      tenantId: item.tenantId,
      href: `/admin/tickets/${item.id}`,
      status: item.status,
    })),
  ];
  const truncated = [
    tenants,
    users,
    invoices,
    integrations,
    jobs,
    logs,
    tickets,
  ].some((items) => items.length === SOURCE_LIMIT);
  return { query: q, results, truncated };
}
