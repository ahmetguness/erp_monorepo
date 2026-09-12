import type { Prisma } from "@prisma/client";
import type {
  AdminDemoRequest,
  DemoDuplicateWarning,
  DemoProvisioningPreview,
  DemoRequestPage,
} from "@repo/types";
import { ValidationError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { modulesForPlan } from "../../../utils/tenant-modules.js";
import type { PlanName } from "@repo/types/plans";
import type { z } from "zod";
import type { demoRequestListSchema } from "./demo-operations.schemas.js";

const historyInclude = {
  history: { orderBy: { createdAt: "desc" as const } },
} as const;
type DemoRow = Prisma.DemoRequestGetPayload<{ include: typeof historyInclude }>;
type ListInput = z.infer<typeof demoRequestListSchema>;

function slugFor(companyName: string): string {
  return `demo-${companyName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)}`;
}

async function duplicateWarnings(
  row: DemoRow,
): Promise<DemoDuplicateWarning[]> {
  const [sameEmail, sameCompany] = await Promise.all([
    prisma.demoRequest.findFirst({
      where: { id: { not: row.id }, email: row.email },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.demoRequest.findFirst({
      where: {
        id: { not: row.id },
        companyName: { equals: row.companyName, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  return [
    ...(sameEmail
      ? [
          {
            kind: "EMAIL" as const,
            message: "Bu e-posta için başka bir demo talebi var.",
            relatedRequestId: sameEmail.id,
          },
        ]
      : []),
    ...(sameCompany
      ? [
          {
            kind: "COMPANY" as const,
            message: "Bu şirket adına benzer bir demo talebi var.",
            relatedRequestId: sameCompany.id,
          },
        ]
      : []),
  ];
}

async function mapRequest(row: DemoRow): Promise<AdminDemoRequest> {
  return {
    id: row.id,
    fullName: row.fullName,
    companyName: row.companyName,
    email: row.email,
    phone: row.phone,
    plan: row.plan,
    status: row.status,
    tenantId: row.tenantId,
    notes: row.notes,
    rejectedReason: row.rejectedReason,
    processedBy: row.processedBy,
    ownerId: row.ownerId,
    slaDueAt: row.slaDueAt.toISOString(),
    slaBreached:
      row.status === "PENDING" && row.slaDueAt.getTime() < Date.now(),
    duplicateWarnings: await duplicateWarnings(row),
    history: row.history.map((event) => ({
      id: event.id,
      action: event.action,
      note: event.note,
      actorId: event.actorId,
      createdAt: event.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDemoRequests(
  input: ListInput,
): Promise<DemoRequestPage> {
  const where: Prisma.DemoRequestWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.search
      ? {
          OR: [
            { companyName: { contains: input.search, mode: "insensitive" } },
            { fullName: { contains: input.search, mode: "insensitive" } },
            { email: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.demoRequest.findMany({
      where,
      include: historyInclude,
      orderBy: [{ slaDueAt: "asc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.demoRequest.count({ where }),
  ]);
  return {
    data: await Promise.all(rows.map(mapRequest)),
    total,
    page: input.page,
    limit: input.limit,
  };
}

export async function getDemoRequest(
  id: string,
): Promise<AdminDemoRequest | null> {
  const row = await prisma.demoRequest.findUnique({
    where: { id },
    include: historyInclude,
  });
  return row ? mapRequest(row) : null;
}

export async function previewDemoProvisioning(
  id: string,
): Promise<DemoProvisioningPreview> {
  const row = await prisma.demoRequest.findUnique({
    where: { id },
    include: historyInclude,
  });
  if (!row) throw new ValidationError("Demo talebi bulunamadı.");
  if (row.status !== "PENDING" && row.status !== "APPROVED")
    throw new ValidationError("Yalnızca bekleyen talepler önizlenebilir.");
  return {
    requestId: row.id,
    companyName: row.companyName,
    plan: row.plan,
    suggestedSlug: slugFor(row.companyName),
    trialDays: 15,
    modules: modulesForPlan(row.plan as PlanName),
    duplicateWarnings: await duplicateWarnings(row),
  };
}

export async function assignDemoRequest(
  id: string,
  ownerId: string,
  actorId: string,
): Promise<void> {
  const owner = await prisma.adminUser.findFirst({
    where: { id: ownerId, isActive: true },
    select: { id: true },
  });
  if (!owner) throw new ValidationError("Aktif admin sahibi bulunamadı.");
  await prisma.demoRequest.update({
    where: { id },
    data: {
      ownerId,
      history: {
        create: { action: "ASSIGNED", actorId, note: `Sahip: ${ownerId}` },
      },
    },
  });
}

export async function addDemoRequestNote(
  id: string,
  note: string,
  actorId: string,
): Promise<void> {
  await prisma.demoRequest.update({
    where: { id },
    data: {
      notes: note,
      history: { create: { action: "NOTE_ADDED", actorId, note } },
    },
  });
}
