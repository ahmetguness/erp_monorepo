import { Priority, ServiceStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type MaintenanceDbClient = PrismaClient;

const OPEN_SERVICE_STATUSES: readonly ServiceStatus[] = [
  ServiceStatus.OPEN,
  ServiceStatus.IN_PROGRESS,
  ServiceStatus.WAITING_PARTS,
  ServiceStatus.WAITING_CUSTOMER,
];

const MAINTENANCE_INTERVAL_DAYS = 180;
const NEW_ASSET_INITIAL_DUE_DAYS = 90;
const DUE_SOON_DAYS = 30;

export interface MaintenanceManagementInput {
  tenantId: string;
  horizonDays: number;
}

export interface MaintenanceAssetRef {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
}

export interface MaintenanceContactRef {
  id: string;
  code: string | null;
  name: string;
}

export interface MaintenanceProductRef {
  id: string;
  code: string;
  name: string;
}

export type MaintenancePlanStatus = 'overdue' | 'due_soon' | 'planned';
export type MaintenanceFaultStatus = 'open' | 'in_progress' | 'waiting_parts' | 'waiting_customer';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical';
export type SparePartRisk = 'available' | 'low_stock' | 'unlinked';

export interface MaintenancePlanRow {
  id: string;
  asset: MaintenanceAssetRef;
  contact: MaintenanceContactRef;
  nextDueAt: string;
  lastServiceAt: string | null;
  status: MaintenancePlanStatus;
  openFaultCount: number;
  recommendedAction: string;
}

export interface MaintenanceFaultRow {
  id: string;
  number: string;
  asset: MaintenanceAssetRef | null;
  contact: MaintenanceContactRef | null;
  subject: string;
  status: MaintenanceFaultStatus;
  priority: MaintenancePriority;
  createdAt: string;
  sparePartCount: number;
  href: string;
}

export interface MaintenanceSparePartRow {
  id: string;
  serviceRequestId: string;
  serviceRequestNumber: string;
  asset: MaintenanceAssetRef | null;
  product: MaintenanceProductRef | null;
  description: string;
  quantity: number;
  availableQty: number | null;
  risk: SparePartRisk;
}

export interface MaintenanceManagementSummary {
  horizonDays: number;
  assetCount: number;
  duePlanCount: number;
  overduePlanCount: number;
  openFaultCount: number;
  waitingPartFaultCount: number;
  sparePartLinkCount: number;
  lowStockPartCount: number;
}

export interface MaintenanceManagementResult {
  summary: MaintenanceManagementSummary;
  plans: MaintenancePlanRow[];
  faults: MaintenanceFaultRow[];
  spareParts: MaintenanceSparePartRow[];
}

interface AssetLookup {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
  purchaseDate: Date | null;
  createdAt: Date;
  contact: MaintenanceContactRef;
  serviceRequests: Array<{
    id: string;
    status: ServiceStatus;
    closedAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
  }>;
}

interface FaultLookup {
  id: string;
  number: string;
  subject: string;
  status: ServiceStatus;
  priority: Priority;
  createdAt: Date;
  contact: MaintenanceContactRef | null;
  customerAsset: MaintenanceAssetRef | null;
  items: Array<{
    id: string;
    description: string;
    quantity: unknown;
    product: (MaintenanceProductRef & {
      minStockLevel: unknown;
      stockLevels: Array<{ quantity: unknown }>;
    }) | null;
  }>;
}

function decimalToNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toIsoDate(value: Date): string {
  return value.toISOString();
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function daysBetween(left: Date, right: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((right.getTime() - left.getTime()) / msPerDay);
}

function planStatus(nextDueAt: Date, now: Date): MaintenancePlanStatus {
  if (nextDueAt < now) return 'overdue';
  if (daysBetween(now, nextDueAt) <= DUE_SOON_DAYS) return 'due_soon';
  return 'planned';
}

function assetRef(asset: MaintenanceAssetRef): MaintenanceAssetRef {
  return {
    id: asset.id,
    name: asset.name,
    brand: asset.brand,
    model: asset.model,
    serialNo: asset.serialNo,
  };
}

function contactRef(contact: MaintenanceContactRef): MaintenanceContactRef {
  return { id: contact.id, code: contact.code, name: contact.name };
}

function priorityValue(priority: Priority): MaintenancePriority {
  if (priority === Priority.CRITICAL) return 'critical';
  if (priority === Priority.HIGH) return 'high';
  if (priority === Priority.LOW) return 'low';
  return 'medium';
}

function faultStatusValue(status: ServiceStatus): MaintenanceFaultStatus {
  if (status === ServiceStatus.IN_PROGRESS) return 'in_progress';
  if (status === ServiceStatus.WAITING_PARTS) return 'waiting_parts';
  if (status === ServiceStatus.WAITING_CUSTOMER) return 'waiting_customer';
  return 'open';
}

function latestServiceDate(asset: AssetLookup): Date | null {
  const serviceDates = asset.serviceRequests
    .filter((request) => request.status === ServiceStatus.COMPLETED)
    .map((request) => request.closedAt ?? request.updatedAt ?? request.createdAt)
    .sort((left, right) => right.getTime() - left.getTime());
  return serviceDates[0] ?? null;
}

function nextDueDate(asset: AssetLookup): { lastServiceAt: Date | null; nextDueAt: Date } {
  const lastServiceAt = latestServiceDate(asset);
  if (lastServiceAt) return { lastServiceAt, nextDueAt: addDays(lastServiceAt, MAINTENANCE_INTERVAL_DAYS) };
  const baseDate = asset.purchaseDate ?? asset.createdAt;
  return { lastServiceAt: null, nextDueAt: addDays(baseDate, NEW_ASSET_INITIAL_DUE_DAYS) };
}

function recommendedAction(status: MaintenancePlanStatus, openFaultCount: number): string {
  if (openFaultCount > 0) return 'Acik ariza ile birlikte bakim planla';
  if (status === 'overdue') return 'Gecikmis bakim emri ac';
  if (status === 'due_soon') return 'Bakim randevusu planla';
  return 'Periyodik takvimde izle';
}

function sparePartRisk(product: FaultLookup['items'][number]['product'], availableQty: number | null): SparePartRisk {
  if (!product) return 'unlinked';
  const minStockLevel = decimalToNumber(product.minStockLevel);
  if ((availableQty ?? 0) <= minStockLevel) return 'low_stock';
  return 'available';
}

export async function getMaintenanceManagement(
  db: MaintenanceDbClient,
  input: MaintenanceManagementInput,
): Promise<MaintenanceManagementResult> {
  const { tenantId, horizonDays } = input;
  const now = new Date();
  const horizonEnd = addDays(now, horizonDays);

  const [assetCount, openFaultCount, assets, faults] = await Promise.all([
    db.customerAsset.count({
      where: { tenantId, deletedAt: null, isActive: true },
    }),
    db.serviceRequest.count({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...OPEN_SERVICE_STATUSES] },
      },
    }),
    db.customerAsset.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        serialNo: true,
        purchaseDate: true,
        createdAt: true,
        contact: { select: { id: true, code: true, name: true } },
        serviceRequests: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            closedAt: true,
            updatedAt: true,
            createdAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    }),
    db.serviceRequest.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...OPEN_SERVICE_STATUSES] },
      },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
        contact: { select: { id: true, code: true, name: true } },
        customerAsset: { select: { id: true, name: true, brand: true, model: true, serialNo: true } },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            product: {
              select: {
                id: true,
                code: true,
                name: true,
                minStockLevel: true,
                stockLevels: { select: { quantity: true } },
              },
            },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
  ]);

  const openFaultCountByAsset = new Map<string, number>();
  for (const fault of faults) {
    if (!fault.customerAsset) continue;
    openFaultCountByAsset.set(fault.customerAsset.id, (openFaultCountByAsset.get(fault.customerAsset.id) ?? 0) + 1);
  }

  const plans = assets
    .map((asset): MaintenancePlanRow => {
      const { lastServiceAt, nextDueAt } = nextDueDate(asset);
      const status = planStatus(nextDueAt, now);
      const openFaultCount = openFaultCountByAsset.get(asset.id) ?? 0;
      return {
        id: asset.id,
        asset: assetRef(asset),
        contact: contactRef(asset.contact),
        nextDueAt: toIsoDate(nextDueAt),
        lastServiceAt: toIsoOrNull(lastServiceAt),
        status,
        openFaultCount,
        recommendedAction: recommendedAction(status, openFaultCount),
      };
    })
    .filter((plan) => new Date(plan.nextDueAt) <= horizonEnd || plan.status === 'overdue' || plan.openFaultCount > 0)
    .sort((left, right) => new Date(left.nextDueAt).getTime() - new Date(right.nextDueAt).getTime());

  const faultRows: MaintenanceFaultRow[] = faults.map((fault) => ({
    id: fault.id,
    number: fault.number,
    asset: fault.customerAsset ? assetRef(fault.customerAsset) : null,
    contact: fault.contact ? contactRef(fault.contact) : null,
    subject: fault.subject,
    status: faultStatusValue(fault.status),
    priority: priorityValue(fault.priority),
    createdAt: toIsoDate(fault.createdAt),
    sparePartCount: fault.items.filter((item) => item.product !== null).length,
    href: `/dashboard/service/requests/${fault.id}`,
  }));

  const spareParts = faults.flatMap((fault): MaintenanceSparePartRow[] => fault.items.map((item) => {
    const availableQty = item.product
      ? item.product.stockLevels.reduce((sum, level) => sum + decimalToNumber(level.quantity), 0)
      : null;
    return {
      id: item.id,
      serviceRequestId: fault.id,
      serviceRequestNumber: fault.number,
      asset: fault.customerAsset ? assetRef(fault.customerAsset) : null,
      product: item.product ? { id: item.product.id, code: item.product.code, name: item.product.name } : null,
      description: item.description,
      quantity: roundQty(decimalToNumber(item.quantity)),
      availableQty: availableQty === null ? null : roundQty(availableQty),
      risk: sparePartRisk(item.product, availableQty === null ? null : availableQty),
    };
  }));

  return {
    summary: {
      horizonDays,
      assetCount,
      duePlanCount: plans.length,
      overduePlanCount: plans.filter((plan) => plan.status === 'overdue').length,
      openFaultCount,
      waitingPartFaultCount: faultRows.filter((fault) => fault.status === 'waiting_parts').length,
      sparePartLinkCount: spareParts.filter((part) => part.product !== null).length,
      lowStockPartCount: spareParts.filter((part) => part.risk === 'low_stock').length,
    },
    plans,
    faults: faultRows,
    spareParts,
  };
}
