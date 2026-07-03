import { EntityType, ServiceActivityType, ServiceStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type FieldServiceDbClient = PrismaClient;

const ACTIVE_SERVICE_STATUSES: readonly ServiceStatus[] = [
  ServiceStatus.OPEN,
  ServiceStatus.IN_PROGRESS,
  ServiceStatus.WAITING_PARTS,
  ServiceStatus.WAITING_CUSTOMER,
];

export type FieldServiceCheckpointKind = 'SERVICE_FORM' | 'CUSTOMER_APPROVAL' | 'VISIT_NOTE';
export type FieldServiceStepStatus = 'complete' | 'pending' | 'blocked';

export interface FieldServiceMobileInput {
  tenantId: string;
  assignedToId?: string;
}

export interface FieldServiceCheckpointInput {
  tenantId: string;
  serviceRequestId: string;
  kind: FieldServiceCheckpointKind;
  note?: string;
  customerName?: string;
}

export interface FieldServiceContactRef {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
}

export interface FieldServiceAssetRef {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
}

export interface FieldServiceRouteStop {
  serviceRequestId: string;
  serviceRequestNumber: string;
  sequence: number;
  title: string;
  address: string | null;
  city: string | null;
  contactPhone: string | null;
}

export interface FieldServiceStep {
  key: 'assignment' | 'route' | 'photos' | 'signature' | 'service_form' | 'customer_approval';
  label: string;
  status: FieldServiceStepStatus;
  detail: string;
}

export interface FieldServiceJobRow {
  id: string;
  number: string;
  subject: string;
  status: ServiceStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedToId: string | null;
  contact: FieldServiceContactRef | null;
  asset: FieldServiceAssetRef | null;
  createdAt: string;
  routeStop: FieldServiceRouteStop;
  photoCount: number;
  signatureCount: number;
  serviceFormSubmitted: boolean;
  customerApproved: boolean;
  steps: FieldServiceStep[];
  href: string;
}

export interface FieldServiceMobileSummary {
  totalJobs: number;
  assignedJobCount: number;
  routeReadyCount: number;
  photoReadyCount: number;
  signatureReadyCount: number;
  formSubmittedCount: number;
  customerApprovedCount: number;
}

export interface FieldServiceMobileResult {
  summary: FieldServiceMobileSummary;
  route: FieldServiceRouteStop[];
  jobs: FieldServiceJobRow[];
}

interface ServiceRequestLookup {
  id: string;
  number: string;
  subject: string;
  status: ServiceStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedToId: string | null;
  createdAt: Date;
  contact: FieldServiceContactRef | null;
  customerAsset: FieldServiceAssetRef | null;
  activities: Array<{
    notes: string | null;
  }>;
}

interface AttachmentLookup {
  entityId: string;
  mimeType: string | null;
  tags: string[];
}

function isCheckpoint(activity: ServiceRequestLookup['activities'][number], kind: FieldServiceCheckpointKind): boolean {
  return activity.notes === `FIELD_SERVICE:${kind}` || (activity.notes?.startsWith(`FIELD_SERVICE:${kind}:`) ?? false);
}

function photoCount(attachments: readonly AttachmentLookup[]): number {
  return attachments.filter((attachment) => (
    attachment.tags.includes('field-photo')
    || ((attachment.mimeType?.startsWith('image/') ?? false) && !attachment.tags.includes('customer-signature'))
  )).length;
}

function signatureCount(attachments: readonly AttachmentLookup[]): number {
  return attachments.filter((attachment) => attachment.tags.includes('customer-signature')).length;
}

function routeDetail(contact: FieldServiceContactRef | null): string {
  if (!contact?.address && !contact?.city) return 'Adres bekleniyor';
  return [contact.address, contact.city].filter(Boolean).join(' / ');
}

function buildStep(input: {
  assignedToId: string | null;
  contact: FieldServiceContactRef | null;
  photos: number;
  signatures: number;
  serviceFormSubmitted: boolean;
  customerApproved: boolean;
}): FieldServiceStep[] {
  return [
    {
      key: 'assignment',
      label: 'Teknisyen atama',
      status: input.assignedToId ? 'complete' : 'pending',
      detail: input.assignedToId ? 'Teknisyen atandi' : 'Atama bekleniyor',
    },
    {
      key: 'route',
      label: 'Rota',
      status: input.contact?.address || input.contact?.city ? 'complete' : 'pending',
      detail: routeDetail(input.contact),
    },
    {
      key: 'photos',
      label: 'Fotograf',
      status: input.photos > 0 ? 'complete' : 'pending',
      detail: `${input.photos} fotograf`,
    },
    {
      key: 'signature',
      label: 'Imza',
      status: input.signatures > 0 ? 'complete' : 'pending',
      detail: `${input.signatures} imza`,
    },
    {
      key: 'service_form',
      label: 'Servis formu',
      status: input.serviceFormSubmitted ? 'complete' : 'pending',
      detail: input.serviceFormSubmitted ? 'Form kaydedildi' : 'Form bekleniyor',
    },
    {
      key: 'customer_approval',
      label: 'Musteri onayi',
      status: input.customerApproved ? 'complete' : input.serviceFormSubmitted ? 'pending' : 'blocked',
      detail: input.customerApproved ? 'Onay alindi' : 'Onay bekleniyor',
    },
  ];
}

function checkpointNote(input: FieldServiceCheckpointInput): string {
  const parts = [
    `FIELD_SERVICE:${input.kind}`,
    input.customerName ? `customer=${input.customerName}` : null,
    input.note ? `note=${input.note}` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(':');
}

export async function getFieldServiceMobileFlow(
  db: FieldServiceDbClient,
  input: FieldServiceMobileInput,
): Promise<FieldServiceMobileResult> {
  const requests = await db.serviceRequest.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      status: { in: [...ACTIVE_SERVICE_STATUSES] },
      ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
    },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      priority: true,
      assignedToId: true,
      createdAt: true,
      contact: { select: { id: true, code: true, name: true, phone: true, address: true, city: true } },
      customerAsset: { select: { id: true, name: true, brand: true, model: true, serialNo: true } },
      activities: {
        select: { notes: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });

  const requestIds = requests.map((request) => request.id);
  const attachments = requestIds.length > 0
    ? await db.attachment.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: EntityType.SERVICE_REQUEST,
        entityId: { in: requestIds },
      },
      select: { entityId: true, mimeType: true, tags: true },
    })
    : [];

  const attachmentsByRequest = new Map<string, AttachmentLookup[]>();
  for (const attachment of attachments) {
    const current = attachmentsByRequest.get(attachment.entityId) ?? [];
    current.push(attachment);
    attachmentsByRequest.set(attachment.entityId, current);
  }

  const jobs = requests.map((request: ServiceRequestLookup, index): FieldServiceJobRow => {
    const requestAttachments = attachmentsByRequest.get(request.id) ?? [];
    const photos = photoCount(requestAttachments);
    const signatures = signatureCount(requestAttachments);
    const serviceFormSubmitted = request.activities.some((activity) => isCheckpoint(activity, 'SERVICE_FORM'));
    const customerApproved = request.activities.some((activity) => isCheckpoint(activity, 'CUSTOMER_APPROVAL'));
    const routeStop: FieldServiceRouteStop = {
      serviceRequestId: request.id,
      serviceRequestNumber: request.number,
      sequence: index + 1,
      title: request.subject,
      address: request.contact?.address ?? null,
      city: request.contact?.city ?? null,
      contactPhone: request.contact?.phone ?? null,
    };

    return {
      id: request.id,
      number: request.number,
      subject: request.subject,
      status: request.status,
      priority: request.priority,
      assignedToId: request.assignedToId,
      contact: request.contact,
      asset: request.customerAsset,
      createdAt: request.createdAt.toISOString(),
      routeStop,
      photoCount: photos,
      signatureCount: signatures,
      serviceFormSubmitted,
      customerApproved,
      steps: buildStep({
        assignedToId: request.assignedToId,
        contact: request.contact,
        photos,
        signatures,
        serviceFormSubmitted,
        customerApproved,
      }),
      href: `/dashboard/service/requests/${request.id}`,
    };
  });

  return {
    summary: {
      totalJobs: jobs.length,
      assignedJobCount: jobs.filter((job) => job.assignedToId !== null).length,
      routeReadyCount: jobs.filter((job) => job.routeStop.address !== null || job.routeStop.city !== null).length,
      photoReadyCount: jobs.filter((job) => job.photoCount > 0).length,
      signatureReadyCount: jobs.filter((job) => job.signatureCount > 0).length,
      formSubmittedCount: jobs.filter((job) => job.serviceFormSubmitted).length,
      customerApprovedCount: jobs.filter((job) => job.customerApproved).length,
    },
    route: jobs.map((job) => job.routeStop),
    jobs,
  };
}

export async function createFieldServiceCheckpoint(
  db: FieldServiceDbClient,
  input: FieldServiceCheckpointInput,
): Promise<{ id: string }> {
  const existing = await db.serviceRequest.findFirst({
    where: { id: input.serviceRequestId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error('SERVICE_REQUEST_NOT_FOUND');

  const activity = await db.serviceActivity.create({
    data: {
      tenantId: input.tenantId,
      serviceRequestId: input.serviceRequestId,
      activityType: input.kind === 'VISIT_NOTE' ? ServiceActivityType.VISIT : ServiceActivityType.NOTE,
      notes: checkpointNote(input),
    },
    select: { id: true },
  });
  return activity;
}
