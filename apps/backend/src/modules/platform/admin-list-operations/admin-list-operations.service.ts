import type {
  AdminBulkNotePreview,
  AdminBulkOperationResult,
  AdminSavedListView,
  AdminTenantListConfig,
} from "@repo/types";
import type { Plan, Prisma, TenantStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { tenantListConfigSchema } from "./admin-list-operations.schemas.js";
import { maskTenantsForAdmin } from "../sensitive-data/sensitive-data.service.js";

function mapView(row: {
  id: string;
  name: string;
  resource: string;
  config: unknown;
  createdAt: Date;
}): AdminSavedListView {
  return {
    id: row.id,
    name: row.name,
    resource: "TENANTS",
    config: tenantListConfigSchema.parse(row.config),
    createdAt: row.createdAt.toISOString(),
  };
}
export async function listSavedViews(
  adminId: string,
): Promise<AdminSavedListView[]> {
  return (
    await prisma.adminSavedListView.findMany({
      where: { adminId, resource: "TENANTS" },
      orderBy: { createdAt: "desc" },
    })
  ).map(mapView);
}
export async function saveListView(
  adminId: string,
  name: string,
  config: AdminTenantListConfig,
): Promise<AdminSavedListView> {
  const configJson: Prisma.InputJsonObject = {
    ...(config.search !== undefined && { search: config.search }),
    ...(config.status !== undefined && { status: config.status }),
    ...(config.plan !== undefined && { plan: config.plan }),
    ...(config.from !== undefined && { from: config.from }),
    ...(config.to !== undefined && { to: config.to }),
    sortBy: config.sortBy,
    sortDirection: config.sortDirection,
    columns: config.columns,
  };
  return mapView(
    await prisma.adminSavedListView.upsert({
      where: { adminId_resource_name: { adminId, resource: "TENANTS", name } },
      create: { adminId, name, resource: "TENANTS", config: configJson },
      update: { config: configJson },
    }),
  );
}
export async function deleteListView(
  adminId: string,
  id: string,
): Promise<boolean> {
  return (
    (
      await prisma.adminSavedListView.deleteMany({
        where: { id, adminId, resource: "TENANTS" },
      })
    ).count > 0
  );
}
export async function previewBulkNote(
  tenantIds: string[],
): Promise<AdminBulkNotePreview> {
  const uniqueIds = [...new Set(tenantIds)];
  const found = await prisma.tenant.findMany({
    where: { id: { in: uniqueIds }, deletedAt: null },
    select: { id: true },
  });
  const foundIds = new Set(found.map((item) => item.id));
  return {
    tenantIds: uniqueIds,
    foundCount: found.length,
    missingIds: uniqueIds.filter((id) => !foundIds.has(id)),
    impactSummary: `${found.length} müşteri hesabına operasyon notu eklenecek.`,
  };
}
export async function executeBulkNote(
  adminId: string,
  tenantIds: string[],
  reason: string,
  note: string,
): Promise<AdminBulkOperationResult> {
  const preview = await previewBulkNote(tenantIds);
  const failed = preview.missingIds.map((tenantId) => ({
    tenantId,
    message: "Müşteri hesabı bulunamadı.",
  }));
  const succeeded: Array<{ tenantId: string }> = [];
  for (const tenantId of preview.tenantIds.filter(
    (id) => !preview.missingIds.includes(id),
  )) {
    try {
      await prisma.tenantSupportNote.create({
        data: {
          tenantId,
          authorId: adminId,
          body: `[Toplu işlem] ${note}\nGerekçe: ${reason}`,
        },
      });
      succeeded.push({ tenantId });
    } catch {
      failed.push({ tenantId, message: "Not eklenemedi." });
    }
  }
  return { succeeded, failed };
}

export async function exportTenantList(adminId: string, input: {
  search?: string;
  status?: TenantStatus;
  plan?: Plan;
  from?: string;
  to?: string;
  sortBy: "createdAt" | "companyName" | "status" | "plan";
  sortDirection: "asc" | "desc";
}): Promise<string> {
  const from = input.from ? new Date(`${input.from}T00:00:00.000Z`) : undefined;
  const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined;
  const rows = await prisma.tenant.findMany({
    where: {
      deletedAt: input.status === "DELETED" ? undefined : null,
      ...(input.status && { status: input.status }),
      ...(input.plan && { plan: input.plan }),
      ...((from || to) && {
        createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
      ...(input.search && {
        OR: [
          { companyName: { contains: input.search, mode: "insensitive" } },
          { slug: { contains: input.search, mode: "insensitive" } },
          { email: { contains: input.search, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id: true,
      companyName: true,
      status: true,
      plan: true,
      email: true,
      phone: true,
      city: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { [input.sortBy]: input.sortDirection },
    take: 10_000,
  });
  const maskedRows = await maskTenantsForAdmin(adminId, rows);
  const cell = (value: string | number | null) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    "id,companyName,status,plan,email,city,users,createdAt",
    ...maskedRows.map((row) =>
      [
        row.id,
        row.companyName,
        row.status,
        row.plan,
        row.email,
        row.city,
        row._count.users,
        row.createdAt.toISOString(),
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\n");
}
