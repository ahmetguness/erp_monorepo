import {
  ContactType,
  DeliveryNoteStatus,
  DeliveryNoteType,
  EntityType,
  InvoiceStatus,
  InvoiceType,
  OrderStatus,
  Priority,
  PurchaseOrderStatus,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { createTask } from './task.service.js';

type EdiB2BDbClient = PrismaClient;

type EdiDirection = 'inbound' | 'outbound';
type EdiDocumentType = 'sales_order' | 'purchase_order' | 'delivery_note' | 'invoice';
type EdiExchangeStatus = 'ready' | 'draft' | 'in_progress' | 'completed' | 'blocked';
type EdiPartnerStatus = 'active' | 'needs_mapping';
type EdiMappingStatus = 'complete' | 'partial' | 'missing';
type EdiSlaStatus = 'ok' | 'warning' | 'breached';

interface PartnerContact {
  id: string;
  code: string | null;
  name: string;
  type: ContactType;
  taxNumber: string | null;
  email: string | null;
}

interface PartnerAccumulator {
  contact: PartnerContact;
  directions: Set<EdiDirection>;
  salesOrderCount: number;
  purchaseOrderCount: number;
  deliveryNoteCount: number;
  invoiceCount: number;
  totalValue: number;
  lastActivityAt: Date | null;
  issues: Set<string>;
}

export interface EdiB2BSummary {
  partnerCount: number;
  readyDocumentCount: number;
  blockedDocumentCount: number;
  inboundOrderCount: number;
  outboundDeliveryCount: number;
  outboundInvoiceCount: number;
  issueCount: number;
}

export interface EdiB2BPartner {
  contactId: string;
  code: string | null;
  name: string;
  type: ContactType;
  directions: EdiDirection[];
  status: EdiPartnerStatus;
  documentCount: number;
  totalValue: number;
  lastActivityAt: string | null;
  issues: string[];
}

export interface EdiB2BDocumentFlow {
  key: EdiDocumentType;
  title: string;
  direction: EdiDirection;
  scope: string;
  endpoint: string;
  format: 'JSON' | 'CSV';
  status: 'configured' | 'needs_mapping';
  readyCount: number;
  blockedCount: number;
  note: string;
}

export interface EdiB2BExchangeItem {
  id: string;
  itemKey: string;
  number: string;
  documentType: EdiDocumentType;
  direction: EdiDirection;
  partnerName: string;
  partnerCode: string | null;
  status: EdiExchangeStatus;
  amount: number | null;
  documentDate: string;
  href: string;
  issueKeys: string[];
  retryEligible: boolean;
  retryAction: string;
  slaStatus: EdiSlaStatus;
  slaDueAt: string;
  slaRemainingMinutes: number;
}

export interface EdiB2BPartnerMapping {
  contactId: string;
  partnerName: string;
  partnerCode: string | null;
  mappingStatus: EdiMappingStatus;
  mappedFieldCount: number;
  requiredFieldCount: number;
  missingFields: string[];
  supportedDocumentTypes: EdiDocumentType[];
  lastValidatedAt: string | null;
}

export interface EdiB2BErrorQueueItem {
  itemKey: string;
  documentNumber: string;
  documentType: EdiDocumentType;
  partnerName: string;
  status: EdiExchangeStatus;
  severity: 'high' | 'medium';
  issues: string[];
  retryEligible: boolean;
  retryAction: string;
  href: string;
}

export interface EdiB2BSlaSummary {
  trackedCount: number;
  breachedCount: number;
  warningCount: number;
  okCount: number;
  averageAgeHours: number;
}

export interface EdiB2BEndpointExample {
  method: 'GET' | 'POST';
  path: string;
  scope: string;
  description: string;
}

export interface EdiB2BHubPayload {
  generatedAt: string;
  summary: EdiB2BSummary;
  partners: EdiB2BPartner[];
  partnerMappings: EdiB2BPartnerMapping[];
  documentFlows: EdiB2BDocumentFlow[];
  exchangeQueue: EdiB2BExchangeItem[];
  errorQueue: EdiB2BErrorQueueItem[];
  sla: EdiB2BSlaSummary;
  endpointExamples: EdiB2BEndpointExample[];
}

export interface EdiB2BRetryTaskResult {
  taskId: string;
  itemKey: string;
  assignedToId: string | null;
}

const SALES_READY_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PARTIALLY_DELIVERED,
];

const PURCHASE_READY_STATUSES: readonly PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

const DELIVERY_READY_STATUSES: readonly DeliveryNoteStatus[] = [
  DeliveryNoteStatus.CONFIRMED,
  DeliveryNoteStatus.PARTIALLY_SHIPPED,
  DeliveryNoteStatus.SHIPPED,
];

const INVOICE_READY_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

function toIsoDate(value: Date): string {
  return value.toISOString();
}

function itemKey(documentType: EdiDocumentType, id: string): string {
  return `${documentType}:${id}`;
}

function amountToNumber(value: { toString(): string } | null | undefined): number {
  if (!value) return 0;
  return Number(value.toString());
}

function createPartnerAccumulator(contact: PartnerContact): PartnerAccumulator {
  const issues = new Set<string>();
  if (!contact.code) issues.add('partner_code_missing');
  if (!contact.taxNumber) issues.add('tax_number_missing');
  if (!contact.email) issues.add('edi_email_missing');

  return {
    contact,
    directions: new Set<EdiDirection>(),
    salesOrderCount: 0,
    purchaseOrderCount: 0,
    deliveryNoteCount: 0,
    invoiceCount: 0,
    totalValue: 0,
    lastActivityAt: null,
    issues,
  };
}

function touchPartner(
  partners: Map<string, PartnerAccumulator>,
  contact: PartnerContact | null,
  direction: EdiDirection,
  date: Date,
  amount: number,
  counter: keyof Pick<PartnerAccumulator, 'salesOrderCount' | 'purchaseOrderCount' | 'deliveryNoteCount' | 'invoiceCount'>,
): void {
  if (!contact) return;
  const current = partners.get(contact.id) ?? createPartnerAccumulator(contact);
  current.directions.add(direction);
  current[counter] += 1;
  current.totalValue += amount;
  if (!current.lastActivityAt || current.lastActivityAt < date) current.lastActivityAt = date;
  partners.set(contact.id, current);
}

function salesOrderStatus(status: OrderStatus): EdiExchangeStatus {
  if (status === OrderStatus.DRAFT) return 'draft';
  if (status === OrderStatus.DELIVERED) return 'completed';
  if (status === OrderStatus.PARTIALLY_DELIVERED) return 'in_progress';
  if (status === OrderStatus.CONFIRMED) return 'ready';
  return 'blocked';
}

function purchaseOrderStatus(status: PurchaseOrderStatus): EdiExchangeStatus {
  if (status === PurchaseOrderStatus.DRAFT) return 'draft';
  if (status === PurchaseOrderStatus.RECEIVED) return 'completed';
  if (status === PurchaseOrderStatus.PARTIALLY_RECEIVED) return 'in_progress';
  if (status === PurchaseOrderStatus.SENT) return 'ready';
  return 'blocked';
}

function deliveryNoteStatus(status: DeliveryNoteStatus): EdiExchangeStatus {
  if (status === DeliveryNoteStatus.DRAFT) return 'draft';
  if (status === DeliveryNoteStatus.DELIVERED) return 'completed';
  if (status === DeliveryNoteStatus.PARTIALLY_SHIPPED || status === DeliveryNoteStatus.SHIPPED) return 'in_progress';
  if (status === DeliveryNoteStatus.CONFIRMED) return 'ready';
  return 'blocked';
}

function invoiceStatus(status: InvoiceStatus): EdiExchangeStatus {
  if (status === InvoiceStatus.CANCELLED) return 'blocked';
  if (status === InvoiceStatus.PAID) return 'completed';
  if (status === InvoiceStatus.SENT || status === InvoiceStatus.PARTIALLY_PAID) return 'in_progress';
  return 'ready';
}

function partnerStatus(issues: Set<string>): EdiPartnerStatus {
  return issues.size > 0 ? 'needs_mapping' : 'active';
}

function documentSlaHours(documentType: EdiDocumentType): number {
  if (documentType === 'delivery_note') return 12;
  if (documentType === 'invoice') return 48;
  return 24;
}

function calculateSla(documentType: EdiDocumentType, documentDate: Date, now: Date): Pick<EdiB2BExchangeItem, 'slaStatus' | 'slaDueAt' | 'slaRemainingMinutes'> {
  const dueAt = new Date(documentDate.getTime() + documentSlaHours(documentType) * 3_600_000);
  const remainingMinutes = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  const warningWindowMinutes = Math.round(documentSlaHours(documentType) * 60 * 0.2);
  const slaStatus: EdiSlaStatus = remainingMinutes < 0 ? 'breached' : remainingMinutes <= warningWindowMinutes ? 'warning' : 'ok';
  return {
    slaStatus,
    slaDueAt: toIsoDate(dueAt),
    slaRemainingMinutes: remainingMinutes,
  };
}

function mappingIssues(contact: PartnerContact | null): string[] {
  if (!contact) return ['partner_missing'];
  const issues: string[] = [];
  if (!contact.code) issues.push('partner_code_missing');
  if (!contact.taxNumber) issues.push('tax_number_missing');
  if (!contact.email) issues.push('edi_email_missing');
  return issues;
}

function documentIssues(status: EdiExchangeStatus, contact: PartnerContact | null): string[] {
  const issues = mappingIssues(contact);
  if (status === 'draft') issues.push('document_draft');
  if (status === 'blocked') issues.push('document_blocked');
  return [...new Set(issues)];
}

function retryActionFor(issues: string[]): string {
  if (issues.some((issue) => issue.endsWith('_missing'))) return 'complete_partner_mapping';
  if (issues.includes('document_draft')) return 'approve_or_complete_document';
  if (issues.includes('document_blocked')) return 'review_blocked_document';
  return 'retry_exchange';
}

function isRetryEligible(status: EdiExchangeStatus, issues: string[]): boolean {
  return status === 'blocked' || status === 'draft' || issues.length > 0;
}

function createExchangeItem(input: {
  id: string;
  number: string;
  documentType: EdiDocumentType;
  direction: EdiDirection;
  contact: PartnerContact | null;
  status: EdiExchangeStatus;
  amount: number | null;
  documentDate: Date;
  href: string;
  now: Date;
}): EdiB2BExchangeItem {
  const issueKeys = documentIssues(input.status, input.contact);
  const retryEligible = isRetryEligible(input.status, issueKeys);
  return {
    id: input.id,
    itemKey: itemKey(input.documentType, input.id),
    number: input.number,
    documentType: input.documentType,
    direction: input.direction,
    partnerName: input.contact?.name ?? 'Baglantisiz cari',
    partnerCode: input.contact?.code ?? null,
    status: input.status,
    amount: input.amount,
    documentDate: toIsoDate(input.documentDate),
    href: input.href,
    issueKeys,
    retryEligible,
    retryAction: retryActionFor(issueKeys),
    ...calculateSla(input.documentType, input.documentDate, input.now),
  };
}

function mappingStatus(missingFields: string[]): EdiMappingStatus {
  if (missingFields.length === 0) return 'complete';
  if (missingFields.length >= 3) return 'missing';
  return 'partial';
}

function buildPartnerMappings(partners: EdiB2BPartner[]): EdiB2BPartnerMapping[] {
  return partners.map((partner) => {
    const missingFields = partner.issues;
    const requiredFieldCount = 3;
    return {
      contactId: partner.contactId,
      partnerName: partner.name,
      partnerCode: partner.code,
      mappingStatus: mappingStatus(missingFields),
      mappedFieldCount: Math.max(requiredFieldCount - missingFields.length, 0),
      requiredFieldCount,
      missingFields,
      supportedDocumentTypes: partner.directions.includes('inbound')
        ? ['sales_order', 'invoice']
        : ['purchase_order', 'delivery_note', 'invoice'],
      lastValidatedAt: partner.lastActivityAt,
    };
  });
}

function buildErrorQueue(queue: EdiB2BExchangeItem[]): EdiB2BErrorQueueItem[] {
  return queue
    .filter((item) => item.status !== 'completed' && (item.retryEligible || item.slaStatus === 'breached'))
    .map((item): EdiB2BErrorQueueItem => ({
      itemKey: item.itemKey,
      documentNumber: item.number,
      documentType: item.documentType,
      partnerName: item.partnerName,
      status: item.status,
      severity: item.slaStatus === 'breached' || item.status === 'blocked' ? 'high' : 'medium',
      issues: item.slaStatus === 'breached' ? [...new Set([...item.issueKeys, 'sla_breached'])] : item.issueKeys,
      retryEligible: item.retryEligible,
      retryAction: item.retryAction,
      href: item.href,
    }))
    .slice(0, 20);
}

function buildSlaSummary(queue: EdiB2BExchangeItem[], now: Date): EdiB2BSlaSummary {
  const tracked = queue.filter((item) => item.status !== 'completed');
  const totalAgeHours = tracked.reduce((sum, item) => {
    const ageMs = now.getTime() - new Date(item.documentDate).getTime();
    return sum + Math.max(ageMs / 3_600_000, 0);
  }, 0);
  return {
    trackedCount: tracked.length,
    breachedCount: tracked.filter((item) => item.slaStatus === 'breached').length,
    warningCount: tracked.filter((item) => item.slaStatus === 'warning').length,
    okCount: tracked.filter((item) => item.slaStatus === 'ok').length,
    averageAgeHours: tracked.length === 0 ? 0 : Number((totalAgeHours / tracked.length).toFixed(1)),
  };
}

function endpointExamples(): EdiB2BEndpointExample[] {
  return [
    {
      method: 'GET',
      path: '/api/external/sales-orders?page=1&limit=20',
      scope: 'orders:read',
      description: 'Buyuk musteri portallari icin satis siparisi listesi.',
    },
    {
      method: 'POST',
      path: '/api/external/sales-orders',
      scope: 'orders:write',
      description: 'EDI 850/B2B siparis mesajindan satis siparisi olusturma.',
    },
    {
      method: 'GET',
      path: '/api/external/invoices?page=1&limit=20',
      scope: 'invoices:read',
      description: 'Fatura akislarinda durum ve tutar senkronizasyonu.',
    },
    {
      method: 'POST',
      path: '/api/external/invoices',
      scope: 'invoices:write',
      description: 'B2B fatura alisverisi icin fatura basligi ve satirlari.',
    },
  ];
}

export class EdiB2BService {
  constructor(private readonly db: EdiB2BDbClient) {}

  async getHub(tenantId: string): Promise<EdiB2BHubPayload> {
    const now = new Date();
    const [
      salesOrders,
      purchaseOrders,
      deliveryNotes,
      invoices,
      readySalesOrderCount,
      readyPurchaseOrderCount,
      readyDeliveryNoteCount,
      readyInvoiceCount,
      blockedSalesOrderCount,
      blockedPurchaseOrderCount,
      blockedDeliveryNoteCount,
    ] = await Promise.all([
      this.db.salesOrder.findMany({
        where: { tenantId, deletedAt: null, status: { not: OrderStatus.CANCELLED } },
        select: {
          id: true,
          number: true,
          date: true,
          status: true,
          totalGross: true,
          contact: { select: { id: true, code: true, name: true, type: true, taxNumber: true, email: true } },
        },
        orderBy: { date: 'desc' },
        take: 60,
      }),
      this.db.purchaseOrder.findMany({
        where: { tenantId, deletedAt: null, status: { not: PurchaseOrderStatus.CANCELLED } },
        select: {
          id: true,
          number: true,
          date: true,
          status: true,
          totalGross: true,
          contact: { select: { id: true, code: true, name: true, type: true, taxNumber: true, email: true } },
        },
        orderBy: { date: 'desc' },
        take: 60,
      }),
      this.db.deliveryNote.findMany({
        where: { tenantId, deletedAt: null, status: { not: DeliveryNoteStatus.CANCELLED } },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          date: true,
          contact: { select: { id: true, code: true, name: true, type: true, taxNumber: true, email: true } },
        },
        orderBy: { date: 'desc' },
        take: 60,
      }),
      this.db.invoice.findMany({
        where: { tenantId, deletedAt: null, status: { not: InvoiceStatus.CANCELLED } },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          date: true,
          totalGross: true,
          contact: { select: { id: true, code: true, name: true, type: true, taxNumber: true, email: true } },
        },
        orderBy: { date: 'desc' },
        take: 60,
      }),
      this.db.salesOrder.count({ where: { tenantId, deletedAt: null, status: { in: [...SALES_READY_STATUSES] } } }),
      this.db.purchaseOrder.count({ where: { tenantId, deletedAt: null, status: { in: [...PURCHASE_READY_STATUSES] } } }),
      this.db.deliveryNote.count({ where: { tenantId, deletedAt: null, status: { in: [...DELIVERY_READY_STATUSES] } } }),
      this.db.invoice.count({ where: { tenantId, deletedAt: null, status: { in: [...INVOICE_READY_STATUSES] } } }),
      this.db.salesOrder.count({ where: { tenantId, deletedAt: null, status: OrderStatus.DRAFT } }),
      this.db.purchaseOrder.count({ where: { tenantId, deletedAt: null, status: PurchaseOrderStatus.DRAFT } }),
      this.db.deliveryNote.count({ where: { tenantId, deletedAt: null, status: DeliveryNoteStatus.DRAFT } }),
    ]);

    const partners = new Map<string, PartnerAccumulator>();
    const queue: EdiB2BExchangeItem[] = [];

    for (const order of salesOrders) {
      touchPartner(partners, order.contact, 'inbound', order.date, amountToNumber(order.totalGross), 'salesOrderCount');
      queue.push(createExchangeItem({
        id: order.id,
        number: order.number,
        documentType: 'sales_order',
        direction: 'inbound',
        contact: order.contact,
        status: salesOrderStatus(order.status),
        amount: amountToNumber(order.totalGross),
        documentDate: order.date,
        href: `/dashboard/sales-orders/${order.id}`,
        now,
      }));
    }

    for (const order of purchaseOrders) {
      touchPartner(partners, order.contact, 'outbound', order.date, amountToNumber(order.totalGross), 'purchaseOrderCount');
      queue.push(createExchangeItem({
        id: order.id,
        number: order.number,
        documentType: 'purchase_order',
        direction: 'outbound',
        contact: order.contact,
        status: purchaseOrderStatus(order.status),
        amount: amountToNumber(order.totalGross),
        documentDate: order.date,
        href: `/dashboard/purchase-orders/${order.id}`,
        now,
      }));
    }

    for (const note of deliveryNotes) {
      const direction: EdiDirection = note.type === DeliveryNoteType.INBOUND ? 'inbound' : 'outbound';
      touchPartner(partners, note.contact, direction, note.date, 0, 'deliveryNoteCount');
      queue.push(createExchangeItem({
        id: note.id,
        number: note.number,
        documentType: 'delivery_note',
        direction,
        contact: note.contact,
        status: deliveryNoteStatus(note.status),
        amount: null,
        documentDate: note.date,
        href: `/dashboard/delivery-notes/${note.id}`,
        now,
      }));
    }

    for (const invoice of invoices) {
      const direction: EdiDirection = invoice.type === InvoiceType.PURCHASE || invoice.type === InvoiceType.RETURN_SALES ? 'inbound' : 'outbound';
      touchPartner(partners, invoice.contact, direction, invoice.date, amountToNumber(invoice.totalGross), 'invoiceCount');
      queue.push(createExchangeItem({
        id: invoice.id,
        number: invoice.number,
        documentType: 'invoice',
        direction,
        contact: invoice.contact,
        status: invoiceStatus(invoice.status),
        amount: amountToNumber(invoice.totalGross),
        documentDate: invoice.date,
        href: `/dashboard/invoices/${invoice.id}`,
        now,
      }));
    }

    const allPartnerRows = Array.from(partners.values())
      .map((partner): EdiB2BPartner => ({
        contactId: partner.contact.id,
        code: partner.contact.code,
        name: partner.contact.name,
        type: partner.contact.type,
        directions: Array.from(partner.directions).sort(),
        status: partnerStatus(partner.issues),
        documentCount: partner.salesOrderCount + partner.purchaseOrderCount + partner.deliveryNoteCount + partner.invoiceCount,
        totalValue: partner.totalValue,
        lastActivityAt: partner.lastActivityAt ? toIsoDate(partner.lastActivityAt) : null,
        issues: Array.from(partner.issues).sort(),
      }))
      .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));

    const partnerRows = allPartnerRows.slice(0, 12);

    const sortedQueue = queue
      .sort((a, b) => b.documentDate.localeCompare(a.documentDate))
      .slice(0, 18);
    const errorQueue = buildErrorQueue(sortedQueue);
    const sla = buildSlaSummary(sortedQueue, now);

    const blockedDocumentCount = blockedSalesOrderCount + blockedPurchaseOrderCount + blockedDeliveryNoteCount;
    const readyDocumentCount = readySalesOrderCount + readyPurchaseOrderCount + readyDeliveryNoteCount + readyInvoiceCount;
    const issueCount = allPartnerRows.reduce((sum, partner) => sum + partner.issues.length, 0) + blockedDocumentCount;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        partnerCount: allPartnerRows.length,
        readyDocumentCount,
        blockedDocumentCount: errorQueue.length,
        inboundOrderCount: readySalesOrderCount,
        outboundDeliveryCount: readyDeliveryNoteCount,
        outboundInvoiceCount: readyInvoiceCount,
        issueCount: issueCount + sla.breachedCount,
      },
      partners: partnerRows,
      partnerMappings: buildPartnerMappings(partnerRows),
      documentFlows: [
        {
          key: 'sales_order',
          title: 'Musteri siparisi',
          direction: 'inbound',
          scope: 'orders:write',
          endpoint: '/api/external/sales-orders',
          format: 'JSON',
          status: readySalesOrderCount > 0 ? 'configured' : 'needs_mapping',
          readyCount: readySalesOrderCount,
          blockedCount: blockedSalesOrderCount,
          note: 'Buyuk musteri portallarindan gelen siparisler satis siparisi olarak alinabilir.',
        },
        {
          key: 'purchase_order',
          title: 'Tedarikci siparisi',
          direction: 'outbound',
          scope: 'purchasing:read',
          endpoint: 'mapping_required:purchase-orders',
          format: 'JSON',
          status: 'needs_mapping',
          readyCount: readyPurchaseOrderCount,
          blockedCount: blockedPurchaseOrderCount,
          note: 'Tedarikci siparisi icin henuz public external endpoint yok; partner mapping ve connector gerekir.',
        },
        {
          key: 'delivery_note',
          title: 'Irsaliye alisverisi',
          direction: 'outbound',
          scope: 'delivery-notes:read',
          endpoint: 'mapping_required:delivery-notes',
          format: 'CSV',
          status: 'needs_mapping',
          readyCount: readyDeliveryNoteCount,
          blockedCount: blockedDeliveryNoteCount,
          note: 'Irsaliye akisinda partner format eslemesi gerekir; mevcut veri hazirligi buradan izlenir.',
        },
        {
          key: 'invoice',
          title: 'Fatura alisverisi',
          direction: 'outbound',
          scope: 'invoices:write',
          endpoint: '/api/external/invoices',
          format: 'JSON',
          status: readyInvoiceCount > 0 ? 'configured' : 'needs_mapping',
          readyCount: readyInvoiceCount,
          blockedCount: 0,
          note: 'Fatura akisinda external invoice endpointleri ve sandbox ornekleri kullanilabilir.',
        },
      ],
      exchangeQueue: sortedQueue,
      errorQueue,
      sla,
      endpointExamples: endpointExamples(),
    };
  }

  async createRetryTask(tenantId: string, userId: string, itemKeyValue: string): Promise<EdiB2BRetryTaskResult | null> {
    const hub = await this.getHub(tenantId);
    const item = hub.errorQueue.find((entry) => entry.itemKey === itemKeyValue);
    if (!item) return null;

    const owner = await this.db.tenantUser.findFirst({
      where: { tenantId, isOwner: true, isActive: true, user: { isActive: true } },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });

    const dueAt = new Date(Date.now() + 24 * 3_600_000);
    const task = await createTask(tenantId, {
      title: `B2B retry: ${item.documentNumber}`,
      detail: `Partner: ${item.partnerName}. Aksiyon: ${item.retryAction}. Sorunlar: ${item.issues.join(', ')}.`,
      type: 'GENERAL',
      priority: item.severity === 'high' ? Priority.HIGH : Priority.MEDIUM,
      module: 'data_exchange',
      entityType: EntityType.OTHER,
      entityId: item.itemKey,
      href: item.href,
      source: `edi-b2b-retry:${item.itemKey}`,
      assignedToId: owner?.userId ?? null,
      createdById: userId,
      dueAt,
    });

    return {
      taskId: task.id,
      itemKey: item.itemKey,
      assignedToId: task.assignedToId,
    };
  }
}
