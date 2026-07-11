import { Priority, ServiceStatus } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { calculateSla } from '../controllers/service-request.controller.js';

type AdvancedServiceDbClient = PrismaClient;

const ACTIVE_SERVICE_STATUSES: readonly ServiceStatus[] = [
  ServiceStatus.OPEN,
  ServiceStatus.IN_PROGRESS,
  ServiceStatus.WAITING_PARTS,
  ServiceStatus.WAITING_CUSTOMER,
];

const advancedServiceRequestSelect = {
  id: true,
  number: true,
  subject: true,
  status: true,
  priority: true,
  assignedToId: true,
  createdAt: true,
  closedAt: true,
  contact: { select: { id: true, name: true, address: true, city: true } },
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      productId: true,
      product: {
        select: {
          id: true,
          code: true,
          name: true,
          stockLevels: { select: { quantity: true } },
        },
      },
    },
  },
  activities: {
    select: { activityType: true, notes: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
} satisfies Prisma.ServiceRequestSelect;

export interface AdvancedServiceInput {
  tenantId: string;
  horizonDays: number;
}

export interface AdvancedServiceSummary {
  horizonDays: number;
  activeRequestCount: number;
  slaBreachedCount: number;
  routeReadyCount: number;
  sparePartRiskCount: number;
  portalTrackedContactCount: number;
  customerWaitingCount: number;
}

export interface AdvancedSlaContractRow {
  key: Priority;
  label: string;
  limitHours: number;
  activeRequestCount: number;
  breachedCount: number;
  avgRemainingMinutes: number;
}

export interface AdvancedTechnicianRouteRow {
  assignedToId: string | null;
  technicianLabel: string;
  stopCount: number;
  cityCount: number;
  highPriorityCount: number;
  routeScore: number;
  nextStops: Array<{
    serviceRequestId: string;
    serviceRequestNumber: string;
    subject: string;
    city: string | null;
    address: string | null;
    priority: Priority;
    sequence: number;
  }>;
}

export interface AdvancedSparePartReservationRow {
  serviceRequestId: string;
  serviceRequestNumber: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  description: string;
  requiredQty: number;
  availableQty: number | null;
  reservedQty: number;
  shortageQty: number;
  status: 'ready' | 'reserve_recommended' | 'shortage' | 'unlinked';
}

export interface AdvancedPortalTrackingRow {
  contactId: string;
  contactName: string;
  portalEnabled: boolean;
  openRequestCount: number;
  waitingCustomerCount: number;
  lastCustomerActivityAt: string | null;
  latestRequestHref: string | null;
}

export interface AdvancedServiceResult {
  generatedAt: string;
  summary: AdvancedServiceSummary;
  slaContracts: AdvancedSlaContractRow[];
  technicianRoutes: AdvancedTechnicianRouteRow[];
  sparePartReservations: AdvancedSparePartReservationRow[];
  portalTracking: AdvancedPortalTrackingRow[];
}

type ServiceRequestLookup = Prisma.ServiceRequestGetPayload<{ select: typeof advancedServiceRequestSelect }>;

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function priorityLimitHours(priority: Priority): number {
  if (priority === Priority.CRITICAL) return 2;
  if (priority === Priority.HIGH) return 4;
  if (priority === Priority.LOW) return 72;
  return 24;
}

function priorityLabel(priority: Priority): string {
  if (priority === Priority.CRITICAL) return 'Kritik SLA';
  if (priority === Priority.HIGH) return 'Yuksek SLA';
  if (priority === Priority.LOW) return 'Dusuk SLA';
  return 'Standart SLA';
}

function priorityWeight(priority: Priority): number {
  if (priority === Priority.CRITICAL) return 4;
  if (priority === Priority.HIGH) return 3;
  if (priority === Priority.MEDIUM) return 2;
  return 1;
}

function serviceHref(id: string): string {
  return `/dashboard/service/requests/${id}`;
}

function customerActivityAt(request: ServiceRequestLookup): Date | null {
  const activities = request.activities
    .filter((activity) => activity.notes?.includes('Yorumu:'))
    .map((activity) => activity.createdAt)
    .sort((left, right) => right.getTime() - left.getTime());
  return activities[0] ?? null;
}

function stockTotals(product: NonNullable<ServiceRequestLookup['items'][number]['product']>): { availableQty: number; reservedQty: number } {
  return {
    availableQty: product.stockLevels.reduce((sum, level) => sum + numeric(level.quantity), 0),
    reservedQty: 0,
  };
}

function reservationStatus(input: {
  productId: string | null;
  availableQty: number | null;
  reservedQty: number;
  requiredQty: number;
}): AdvancedSparePartReservationRow['status'] {
  if (!input.productId || input.availableQty === null) return 'unlinked';
  if (input.availableQty < input.requiredQty) return 'shortage';
  if (input.reservedQty < input.requiredQty) return 'reserve_recommended';
  return 'ready';
}

function buildSlaContracts(requests: readonly ServiceRequestLookup[]): AdvancedSlaContractRow[] {
  return Object.values(Priority).map((priority) => {
    const rows = requests.filter((request) => request.priority === priority);
    const slaRows = rows.map((request) => calculateSla(request.createdAt, request.priority, request.status, request.closedAt));
    const avgRemainingMinutes = slaRows.length === 0
      ? 0
      : round(slaRows.reduce((sum, sla) => sum + sla.remainingMinutes, 0) / slaRows.length, 0);
    return {
      key: priority,
      label: priorityLabel(priority),
      limitHours: priorityLimitHours(priority),
      activeRequestCount: rows.length,
      breachedCount: slaRows.filter((sla) => sla.isBreached).length,
      avgRemainingMinutes,
    };
  });
}

function buildTechnicianRoutes(requests: readonly ServiceRequestLookup[]): AdvancedTechnicianRouteRow[] {
  const byTechnician = new Map<string, ServiceRequestLookup[]>();
  for (const request of requests) {
    const key = request.assignedToId ?? 'unassigned';
    const current = byTechnician.get(key) ?? [];
    current.push(request);
    byTechnician.set(key, current);
  }

  return [...byTechnician.entries()]
    .map(([key, rows]): AdvancedTechnicianRouteRow => {
      const sortedStops = [...rows].sort((left, right) => {
        const byPriority = priorityWeight(right.priority) - priorityWeight(left.priority);
        if (byPriority !== 0) return byPriority;
        const byCity = (left.contact?.city ?? '').localeCompare(right.contact?.city ?? '');
        if (byCity !== 0) return byCity;
        return left.createdAt.getTime() - right.createdAt.getTime();
      });
      const cityCount = new Set(sortedStops.map((row) => row.contact?.city).filter(Boolean)).size;
      const highPriorityCount = sortedStops.filter((row) => row.priority === Priority.CRITICAL || row.priority === Priority.HIGH).length;
      const routeScore = Math.max(0, 100 - (cityCount * 8) - (sortedStops.length * 2) + (highPriorityCount * 4));
      return {
        assignedToId: key === 'unassigned' ? null : key,
        technicianLabel: key === 'unassigned' ? 'Atanmamis' : key,
        stopCount: sortedStops.length,
        cityCount,
        highPriorityCount,
        routeScore: Math.min(100, routeScore),
        nextStops: sortedStops.slice(0, 6).map((request, index) => ({
          serviceRequestId: request.id,
          serviceRequestNumber: request.number,
          subject: request.subject,
          city: request.contact?.city ?? null,
          address: request.contact?.address ?? null,
          priority: request.priority,
          sequence: index + 1,
        })),
      };
    })
    .sort((left, right) => right.stopCount - left.stopCount)
    .slice(0, 10);
}

function buildSparePartReservations(requests: readonly ServiceRequestLookup[]): AdvancedSparePartReservationRow[] {
  return requests.flatMap((request) => request.items.map((item): AdvancedSparePartReservationRow => {
    const requiredQty = numeric(item.quantity);
    const totals = item.product ? stockTotals(item.product) : null;
    const availableQty = totals?.availableQty ?? null;
    const reservedQty = totals?.reservedQty ?? 0;
    return {
      serviceRequestId: request.id,
      serviceRequestNumber: request.number,
      productId: item.productId,
      productCode: item.product?.code ?? null,
      productName: item.product?.name ?? null,
      description: item.description,
      requiredQty: round(requiredQty, 3),
      availableQty: availableQty === null ? null : round(availableQty, 3),
      reservedQty: round(reservedQty, 3),
      shortageQty: availableQty === null ? requiredQty : round(Math.max(requiredQty - availableQty, 0), 3),
      status: reservationStatus({ productId: item.productId, availableQty, reservedQty, requiredQty }),
    };
  }))
    .filter((row) => row.status !== 'ready')
    .slice(0, 20);
}

function buildPortalTracking(requests: readonly ServiceRequestLookup[], portalContactIds: ReadonlySet<string>): AdvancedPortalTrackingRow[] {
  const byContact = new Map<string, ServiceRequestLookup[]>();
  for (const request of requests) {
    if (!request.contact) continue;
    const current = byContact.get(request.contact.id) ?? [];
    current.push(request);
    byContact.set(request.contact.id, current);
  }

  return [...byContact.entries()]
    .map(([contactId, rows]): AdvancedPortalTrackingRow => {
      const latestRequest = [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      const latestCustomerActivity = rows
        .map(customerActivityAt)
        .filter((value): value is Date => value !== null)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      return {
        contactId,
        contactName: rows[0]?.contact?.name ?? '-',
        portalEnabled: portalContactIds.has(contactId),
        openRequestCount: rows.length,
        waitingCustomerCount: rows.filter((request) => request.status === ServiceStatus.WAITING_CUSTOMER).length,
        lastCustomerActivityAt: latestCustomerActivity?.toISOString() ?? null,
        latestRequestHref: latestRequest ? serviceHref(latestRequest.id) : null,
      };
    })
    .sort((left, right) => Number(right.portalEnabled) - Number(left.portalEnabled) || right.openRequestCount - left.openRequestCount)
    .slice(0, 12);
}

export async function getAdvancedService(
  db: AdvancedServiceDbClient,
  input: AdvancedServiceInput,
): Promise<AdvancedServiceResult> {
  const { tenantId, horizonDays } = input;
  const now = new Date();
  const horizonStart = new Date(now);
  horizonStart.setUTCDate(horizonStart.getUTCDate() - horizonDays);

  const [requests, portalSettings] = await Promise.all([
    db.serviceRequest.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { status: { in: [...ACTIVE_SERVICE_STATUSES] } },
          { updatedAt: { gte: horizonStart } },
        ],
      },
      select: advancedServiceRequestSelect,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 150,
    }),
    db.tenantSetting.findMany({
      where: { tenantId, key: { startsWith: 'portal.token.' } },
      select: { key: true },
    }),
  ]);

  const activeRequests = requests.filter((request) => ACTIVE_SERVICE_STATUSES.includes(request.status));
  const slaContracts = buildSlaContracts(activeRequests);
  const technicianRoutes = buildTechnicianRoutes(activeRequests);
  const sparePartReservations = buildSparePartReservations(activeRequests);
  const portalContactIds = new Set(portalSettings.map((setting) => setting.key.replace('portal.token.', '')));
  const portalTracking = buildPortalTracking(requests, portalContactIds);

  return {
    generatedAt: now.toISOString(),
    summary: {
      horizonDays,
      activeRequestCount: activeRequests.length,
      slaBreachedCount: slaContracts.reduce((sum, row) => sum + row.breachedCount, 0),
      routeReadyCount: technicianRoutes.filter((row) => row.stopCount > 0 && row.cityCount > 0).length,
      sparePartRiskCount: sparePartReservations.filter((row) => row.status === 'shortage' || row.status === 'unlinked').length,
      portalTrackedContactCount: portalTracking.filter((row) => row.portalEnabled).length,
      customerWaitingCount: activeRequests.filter((request) => request.status === ServiceStatus.WAITING_CUSTOMER).length,
    },
    slaContracts,
    technicianRoutes,
    sparePartReservations,
    portalTracking,
  };
}
