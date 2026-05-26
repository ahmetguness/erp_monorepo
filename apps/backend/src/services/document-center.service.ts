import { EntityType, Prisma, type PrismaClient } from '@prisma/client';

export type DocumentCenterSource = 'ATTACHMENT' | 'MAIL';
export type DocumentCenterCategory =
  | 'CUSTOMER'
  | 'EMPLOYEE'
  | 'SALES'
  | 'PURCHASING'
  | 'SERVICE'
  | 'INVENTORY'
  | 'CONTRACT'
  | 'MAIL'
  | 'OTHER';
export type DocumentKind = 'GENERAL' | 'EMPLOYEE_DOCUMENT' | 'CONTRACT';
export type DocumentConfidentiality = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL';

export interface DocumentCenterFilters {
  tenantId: string;
  userId: string;
  search?: string;
  category?: DocumentCenterCategory;
  entityType?: EntityType;
  source?: DocumentCenterSource;
  page: number;
  limit: number;
}

export interface DocumentCenterItem {
  id: string;
  source: DocumentCenterSource;
  category: DocumentCenterCategory;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  uploadedById: string | null;
  uploadedByLabel: string | null;
  entityType: EntityType | 'MAIL';
  entityId: string;
  entityLabel: string | null;
  href: string | null;
  downloadUrl: string | null;
  tags: string[];
  documentKind: DocumentKind | null;
  confidentiality: DocumentConfidentiality | null;
  validFrom: string | null;
  validUntil: string | null;
  version: number | null;
  versionGroupKey: string | null;
  versionCount: number;
  latestVersion: number | null;
  isLatestVersion: boolean;
  lifecycleStatus: DocumentLifecycleStatus;
  lifecycleAction: string | null;
  ocrStatus: DocumentOcrStatus;
  isExpired: boolean;
  expiresSoon: boolean;
}

export interface DocumentCenterSummary {
  totalDocuments: number;
  attachmentCount: number;
  mailAttachmentCount: number;
  totalSizeBytes: number;
  expiredCount: number;
  expiringSoonCount: number;
  contractCount: number;
  employeeDocumentCount: number;
  confidentialCount: number;
  oldVersionCount: number;
  ocrReadyCount: number;
  ocrProviderRequiredCount: number;
}

export interface DocumentCenterResult {
  data: DocumentCenterItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    summary: DocumentCenterSummary;
  };
}

interface AttachmentRow {
  id: string;
  entityType: EntityType;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  category: string | null;
  tags: string[];
  documentKind: string | null;
  confidentiality: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  version: number;
  uploadedById: string | null;
  createdAt: Date;
}

interface MailAttachmentRecord {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  mailId: string;
  subject: string;
  sentById: string | null;
  createdAt: Date;
}

type DocumentLifecycleStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_EXPIRY';
type DocumentOcrStatus = 'TEXT_READY' | 'PROVIDER_REQUIRED' | 'NOT_SUPPORTED';

interface VersionGroupInfo {
  key: string;
  count: number;
  latestVersion: number;
  latestCreatedAt: Date;
}

const ALL_CATEGORIES: readonly DocumentCenterCategory[] = [
  'CUSTOMER',
  'EMPLOYEE',
  'SALES',
  'PURCHASING',
  'SERVICE',
  'INVENTORY',
  'CONTRACT',
  'MAIL',
  'OTHER',
];

const ALL_SOURCES: readonly DocumentCenterSource[] = ['ATTACHMENT', 'MAIL'];
const ALL_DOCUMENT_KINDS: readonly DocumentKind[] = ['GENERAL', 'EMPLOYEE_DOCUMENT', 'CONTRACT'];
const ALL_CONFIDENTIALITIES: readonly DocumentConfidentiality[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'];

const CONTRACT_TERMS = ['contract', 'sozlesme', 'sözleşme'];

function isDocumentCenterCategory(value: string | undefined): value is DocumentCenterCategory {
  return Boolean(value && ALL_CATEGORIES.includes(value as DocumentCenterCategory));
}

function isDocumentCenterSource(value: string | undefined): value is DocumentCenterSource {
  return Boolean(value && ALL_SOURCES.includes(value as DocumentCenterSource));
}

function isDocumentKind(value: string | undefined): value is DocumentKind {
  return Boolean(value && ALL_DOCUMENT_KINDS.includes(value as DocumentKind));
}

function isDocumentConfidentiality(value: string | undefined): value is DocumentConfidentiality {
  return Boolean(value && ALL_CONFIDENTIALITIES.includes(value as DocumentConfidentiality));
}

export function parseDocumentCenterCategory(value: string | undefined): DocumentCenterCategory | undefined {
  return isDocumentCenterCategory(value) ? value : undefined;
}

export function parseDocumentCenterSource(value: string | undefined): DocumentCenterSource | undefined {
  return isDocumentCenterSource(value) ? value : undefined;
}

export function parseDocumentKind(value: string | undefined): DocumentKind | undefined {
  return isDocumentKind(value) ? value : undefined;
}

export function parseDocumentConfidentiality(value: string | undefined): DocumentConfidentiality | undefined {
  return isDocumentConfidentiality(value) ? value : undefined;
}

function normalizeSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

function isContractFile(fileName: string): boolean {
  const normalized = normalizeForSearch(fileName);
  return CONTRACT_TERMS.some((term) => normalized.includes(term));
}

function categoryForAttachment(entityType: EntityType, fileName: string): DocumentCenterCategory {
  if (isContractFile(fileName)) return 'CONTRACT';

  switch (entityType) {
    case EntityType.CONTACT:
    case EntityType.CUSTOMER_ASSET:
      return 'CUSTOMER';
    case EntityType.EMPLOYEE:
      return 'EMPLOYEE';
    case EntityType.INVOICE:
    case EntityType.SALES_QUOTE:
    case EntityType.SALES_ORDER:
    case EntityType.DELIVERY_NOTE:
      return 'SALES';
    case EntityType.PURCHASE_ORDER:
      return 'PURCHASING';
    case EntityType.SERVICE_REQUEST:
      return 'SERVICE';
    case EntityType.PRODUCT:
    case EntityType.CATEGORY:
    case EntityType.WORK_ORDER:
      return 'INVENTORY';
    case EntityType.OTHER:
      return 'OTHER';
  }
}

function extensionTag(fileName: string): string | null {
  const extension = fileName.split('.').pop();
  return extension && extension !== fileName ? extension.toUpperCase() : null;
}

function baseFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return normalizeForSearch(dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName);
}

function mimeTag(mimeType: string | null): string {
  if (!mimeType) return 'Dosya';
  if (mimeType.startsWith('image/')) return 'Görsel';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet')) return 'Excel';
  if (mimeType.includes('wordprocessing')) return 'Word';
  if (mimeType.includes('csv')) return 'CSV';
  if (mimeType.startsWith('text/')) return 'Metin';
  return 'Dosya';
}

function compactTags(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function metadataCategory(row: AttachmentRow): DocumentCenterCategory {
  return parseDocumentCenterCategory(row.category ?? undefined) ?? categoryForAttachment(row.entityType, row.fileName);
}

function metadataDocumentKind(row: AttachmentRow, category: DocumentCenterCategory): DocumentKind | null {
  const explicitKind = parseDocumentKind(row.documentKind ?? undefined);
  if (explicitKind) return explicitKind;
  if (category === 'CONTRACT') return 'CONTRACT';
  if (row.entityType === EntityType.EMPLOYEE) return 'EMPLOYEE_DOCUMENT';
  return null;
}

function metadataConfidentiality(value: string | null): DocumentConfidentiality | null {
  return parseDocumentConfidentiality(value ?? undefined) ?? null;
}

function expiresSoon(validUntil: Date | null, now: Date): boolean {
  if (!validUntil) return false;
  const soon = new Date(now.getTime() + 30 * 86_400_000);
  return validUntil > now && validUntil <= soon;
}

function lifecycleStatus(validUntil: Date | null, now: Date): DocumentLifecycleStatus {
  if (!validUntil) return 'NO_EXPIRY';
  if (validUntil < now) return 'EXPIRED';
  return expiresSoon(validUntil, now) ? 'EXPIRING_SOON' : 'ACTIVE';
}

function lifecycleAction(
  status: DocumentLifecycleStatus,
  documentKind: DocumentKind | null,
): string | null {
  if (status === 'EXPIRED') return documentKind === 'CONTRACT' ? 'Sozlesme yenileme surecini baslatin.' : 'Guncel belge talep edin.';
  if (status === 'EXPIRING_SOON') return documentKind === 'CONTRACT' ? 'Yenileme hatirlatmasi olusturun.' : 'Gecerlilik bitmeden yenisini isteyin.';
  return null;
}

function ocrStatus(mimeType: string | null): DocumentOcrStatus {
  if (mimeType === 'text/plain' || mimeType === 'text/csv') return 'TEXT_READY';
  if (mimeType?.includes('pdf') || mimeType?.startsWith('image/')) return 'PROVIDER_REQUIRED';
  return 'NOT_SUPPORTED';
}

function versionGroupKey(row: AttachmentRow): string {
  return `${row.entityType}:${row.entityId}:${row.documentKind ?? 'GENERAL'}:${baseFileName(row.fileName)}`;
}

function buildVersionGroups(rows: AttachmentRow[]): Map<string, VersionGroupInfo> {
  const groups = new Map<string, VersionGroupInfo>();
  for (const row of rows) {
    const key = versionGroupKey(row);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { key, count: 1, latestVersion: row.version, latestCreatedAt: row.createdAt });
      continue;
    }

    const isNewLatest =
      row.version > current.latestVersion ||
      (row.version === current.latestVersion && row.createdAt > current.latestCreatedAt);
    groups.set(key, {
      key,
      count: current.count + 1,
      latestVersion: isNewLatest ? row.version : current.latestVersion,
      latestCreatedAt: isNewLatest ? row.createdAt : current.latestCreatedAt,
    });
  }
  return groups;
}

async function getTenantUserEmail(db: PrismaClient, tenantId: string, userId: string): Promise<string | null> {
  const tenantUser = await db.tenantUser.findFirst({
    where: {
      tenantId,
      userId,
      isActive: true,
      user: { isActive: true },
    },
    select: { user: { select: { email: true } } },
  });
  return tenantUser?.user.email ?? null;
}

function visibleMailWhere(userId: string, email: string): Prisma.MailMessageWhereInput {
  return {
    OR: [
      { sentById: userId },
      { to: { has: email } },
      { cc: { has: email } },
      { bcc: { has: email } },
    ],
  };
}

function entityKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function collectEntityIds(rows: AttachmentRow[], entityType: EntityType): string[] {
  return Array.from(new Set(rows.filter((row) => row.entityType === entityType).map((row) => row.entityId)));
}

async function resolveUserLabels(
  db: PrismaClient,
  tenantId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return labels;

  const tenantUsers = await db.tenantUser.findMany({
    where: { tenantId, userId: { in: uniqueIds }, isActive: true },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  tenantUsers.forEach((tenantUser) => labels.set(tenantUser.userId, `${tenantUser.user.name} (${tenantUser.user.email})`));
  return labels;
}

async function resolveEntityLabels(
  db: PrismaClient,
  tenantId: string,
  rows: AttachmentRow[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  const contactIds = collectEntityIds(rows, EntityType.CONTACT);
  if (contactIds.length > 0) {
    const contacts = await db.contact.findMany({ where: { tenantId, id: { in: contactIds } }, select: { id: true, name: true, code: true } });
    contacts.forEach((contact) => labels.set(entityKey(EntityType.CONTACT, contact.id), contact.code ? `${contact.code} - ${contact.name}` : contact.name));
  }

  const employeeIds = collectEntityIds(rows, EntityType.EMPLOYEE);
  if (employeeIds.length > 0) {
    const employees = await db.employee.findMany({ where: { tenantId, id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true } });
    employees.forEach((employee) => labels.set(entityKey(EntityType.EMPLOYEE, employee.id), `${employee.firstName} ${employee.lastName}`));
  }

  const invoiceIds = collectEntityIds(rows, EntityType.INVOICE);
  if (invoiceIds.length > 0) {
    const invoices = await db.invoice.findMany({ where: { tenantId, id: { in: invoiceIds } }, select: { id: true, number: true } });
    invoices.forEach((invoice) => labels.set(entityKey(EntityType.INVOICE, invoice.id), invoice.number));
  }

  const salesQuoteIds = collectEntityIds(rows, EntityType.SALES_QUOTE);
  if (salesQuoteIds.length > 0) {
    const quotes = await db.salesQuote.findMany({ where: { tenantId, id: { in: salesQuoteIds }, deletedAt: null }, select: { id: true, number: true } });
    quotes.forEach((quote) => labels.set(entityKey(EntityType.SALES_QUOTE, quote.id), quote.number));
  }

  const productIds = collectEntityIds(rows, EntityType.PRODUCT);
  if (productIds.length > 0) {
    const products = await db.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, name: true, code: true } });
    products.forEach((product) => labels.set(entityKey(EntityType.PRODUCT, product.id), `${product.code} - ${product.name}`));
  }

  const categoryIds = collectEntityIds(rows, EntityType.CATEGORY);
  if (categoryIds.length > 0) {
    const categories = await db.category.findMany({ where: { tenantId, id: { in: categoryIds } }, select: { id: true, name: true } });
    categories.forEach((category) => labels.set(entityKey(EntityType.CATEGORY, category.id), category.name));
  }

  const assetIds = collectEntityIds(rows, EntityType.CUSTOMER_ASSET);
  if (assetIds.length > 0) {
    const assets = await db.customerAsset.findMany({ where: { tenantId, id: { in: assetIds } }, select: { id: true, name: true, serialNo: true } });
    assets.forEach((asset) => labels.set(entityKey(EntityType.CUSTOMER_ASSET, asset.id), asset.serialNo ? `${asset.name} - ${asset.serialNo}` : asset.name));
  }

  const serviceRequestIds = collectEntityIds(rows, EntityType.SERVICE_REQUEST);
  if (serviceRequestIds.length > 0) {
    const requests = await db.serviceRequest.findMany({ where: { tenantId, id: { in: serviceRequestIds } }, select: { id: true, number: true, subject: true } });
    requests.forEach((request) => labels.set(entityKey(EntityType.SERVICE_REQUEST, request.id), `${request.number} - ${request.subject}`));
  }

  const purchaseOrderIds = collectEntityIds(rows, EntityType.PURCHASE_ORDER);
  if (purchaseOrderIds.length > 0) {
    const orders = await db.purchaseOrder.findMany({ where: { tenantId, id: { in: purchaseOrderIds } }, select: { id: true, number: true } });
    orders.forEach((order) => labels.set(entityKey(EntityType.PURCHASE_ORDER, order.id), order.number));
  }

  const salesOrderIds = collectEntityIds(rows, EntityType.SALES_ORDER);
  if (salesOrderIds.length > 0) {
    const orders = await db.salesOrder.findMany({ where: { tenantId, id: { in: salesOrderIds } }, select: { id: true, number: true } });
    orders.forEach((order) => labels.set(entityKey(EntityType.SALES_ORDER, order.id), order.number));
  }

  const workOrderIds = collectEntityIds(rows, EntityType.WORK_ORDER);
  if (workOrderIds.length > 0) {
    const orders = await db.workOrder.findMany({ where: { tenantId, id: { in: workOrderIds } }, select: { id: true, number: true } });
    orders.forEach((order) => labels.set(entityKey(EntityType.WORK_ORDER, order.id), order.number));
  }

  const deliveryNoteIds = collectEntityIds(rows, EntityType.DELIVERY_NOTE);
  if (deliveryNoteIds.length > 0) {
    const notes = await db.deliveryNote.findMany({ where: { tenantId, id: { in: deliveryNoteIds } }, select: { id: true, number: true } });
    notes.forEach((note) => labels.set(entityKey(EntityType.DELIVERY_NOTE, note.id), note.number));
  }

  return labels;
}

function hrefForAttachment(entityType: EntityType, entityId: string): string | null {
  switch (entityType) {
    case EntityType.CONTACT:
      return `/dashboard/contacts/${entityId}`;
    case EntityType.EMPLOYEE:
      return `/dashboard/hr/employees/${entityId}`;
    case EntityType.INVOICE:
      return `/dashboard/invoices/${entityId}`;
    case EntityType.SALES_QUOTE:
      return `/dashboard/sales-orders/quotes/${entityId}`;
    case EntityType.PRODUCT:
      return `/dashboard/products/${entityId}`;
    case EntityType.SALES_ORDER:
      return `/dashboard/sales-orders/${entityId}`;
    case EntityType.PURCHASE_ORDER:
      return `/dashboard/purchase-orders/${entityId}`;
    case EntityType.SERVICE_REQUEST:
      return `/dashboard/service/requests/${entityId}`;
    case EntityType.WORK_ORDER:
      return `/dashboard/production/work-orders/${entityId}`;
    case EntityType.DELIVERY_NOTE:
      return '/dashboard/delivery-notes';
    case EntityType.CUSTOMER_ASSET:
      return '/dashboard/service/assets';
    case EntityType.CATEGORY:
      return null;
    case EntityType.OTHER:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMailAttachmentArray(value: unknown): Array<{ filename: string; contentType: string | null; sizeBytes: number | null }> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const filename = item.filename;
    if (typeof filename !== 'string' || !filename.trim()) return [];
    const contentType = typeof item.contentType === 'string' ? item.contentType : null;
    const sizeBytes = typeof item.sizeBytes === 'number' ? item.sizeBytes : null;
    return [{ filename, contentType, sizeBytes }];
  });
}

export class DocumentCenterService {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: DocumentCenterFilters): Promise<DocumentCenterResult> {
    const search = normalizeSearch(filters.search);
    const attachmentWhere: Prisma.AttachmentWhereInput = {
      tenantId: filters.tenantId,
      ...(filters.entityType && { entityType: filters.entityType }),
    };

    const includeAttachments = !filters.source || filters.source === 'ATTACHMENT';
    const shouldIncludeMail = !filters.source || filters.source === 'MAIL';
    const userEmail = shouldIncludeMail ? await getTenantUserEmail(this.db, filters.tenantId, filters.userId) : null;
    const includeMail = shouldIncludeMail && Boolean(userEmail);

    const [attachmentRows, mailRows] = await Promise.all([
      includeAttachments
        ? this.db.attachment.findMany({
            where: attachmentWhere,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              entityType: true,
              entityId: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              category: true,
              tags: true,
              documentKind: true,
              confidentiality: true,
              validFrom: true,
              validUntil: true,
              version: true,
              uploadedById: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      includeMail
        ? this.db.mailMessage.findMany({
            where: {
              tenantId: filters.tenantId,
              attachmentCount: { gt: 0 },
              ...(userEmail && visibleMailWhere(filters.userId, userEmail)),
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              subject: true,
              attachments: true,
              sentById: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const mailAttachments: MailAttachmentRecord[] = mailRows.flatMap((mail) =>
      readMailAttachmentArray(mail.attachments ?? Prisma.JsonNull).map((attachment, index) => ({
        id: `mail:${mail.id}:${index}`,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        mailId: mail.id,
        subject: mail.subject,
        sentById: mail.sentById,
        createdAt: mail.createdAt,
      })),
    );

    const [entityLabels, userLabels] = await Promise.all([
      resolveEntityLabels(this.db, filters.tenantId, attachmentRows),
      resolveUserLabels(this.db, filters.tenantId, [
        ...attachmentRows.map((row) => row.uploadedById).filter((id): id is string => Boolean(id)),
        ...mailAttachments.map((row) => row.sentById).filter((id): id is string => Boolean(id)),
      ]),
    ]);

    const now = new Date();
    const versionGroups = buildVersionGroups(attachmentRows);
    const attachmentItems = attachmentRows.map<DocumentCenterItem>((row) => {
      const category = metadataCategory(row);
      const documentKind = metadataDocumentKind(row, category);
      const groupKey = versionGroupKey(row);
      const versionGroup = versionGroups.get(groupKey);
      const status = lifecycleStatus(row.validUntil, now);
      const rowOcrStatus = ocrStatus(row.mimeType);
      return {
        id: row.id,
        source: 'ATTACHMENT',
        category,
        fileName: row.fileName,
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        createdAt: row.createdAt.toISOString(),
        uploadedById: row.uploadedById,
        uploadedByLabel: row.uploadedById ? userLabels.get(row.uploadedById) ?? null : null,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: entityLabels.get(entityKey(row.entityType, row.entityId)) ?? null,
        href: hrefForAttachment(row.entityType, row.entityId),
        downloadUrl: `/api/attachments/${row.id}/download`,
        tags: compactTags([...row.tags, category, mimeTag(row.mimeType), extensionTag(row.fileName)]),
        documentKind,
        confidentiality: metadataConfidentiality(row.confidentiality),
        validFrom: row.validFrom?.toISOString() ?? null,
        validUntil: row.validUntil?.toISOString() ?? null,
        version: row.version,
        versionGroupKey: groupKey,
        versionCount: versionGroup?.count ?? 1,
        latestVersion: versionGroup?.latestVersion ?? row.version,
        isLatestVersion: row.version === (versionGroup?.latestVersion ?? row.version),
        lifecycleStatus: status,
        lifecycleAction: lifecycleAction(status, documentKind),
        ocrStatus: rowOcrStatus,
        isExpired: status === 'EXPIRED',
        expiresSoon: status === 'EXPIRING_SOON',
      };
    });

    const mailItems = mailAttachments.map<DocumentCenterItem>((row) => ({
      id: row.id,
      source: 'MAIL',
      category: 'MAIL',
      fileName: row.filename,
      mimeType: row.contentType,
      fileSize: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      uploadedById: row.sentById,
      uploadedByLabel: row.sentById ? userLabels.get(row.sentById) ?? null : null,
      entityType: 'MAIL',
      entityId: row.mailId,
      entityLabel: row.subject,
      href: '/dashboard/mail',
      downloadUrl: null,
      tags: compactTags(['MAIL', mimeTag(row.contentType), extensionTag(row.filename)]),
      documentKind: null,
      confidentiality: null,
      validFrom: null,
      validUntil: null,
      version: null,
      versionGroupKey: null,
      versionCount: 1,
      latestVersion: null,
      isLatestVersion: true,
      lifecycleStatus: 'NO_EXPIRY',
      lifecycleAction: null,
      ocrStatus: 'NOT_SUPPORTED',
      isExpired: false,
      expiresSoon: false,
    }));

    const normalizedSearch = search ? normalizeForSearch(search) : null;
    const allItems = [...attachmentItems, ...mailItems]
      .filter((item) => !filters.category || item.category === filters.category)
      .filter((item) => {
        if (!normalizedSearch) return true;
        return [
          item.fileName,
          item.entityLabel ?? '',
          item.uploadedByLabel ?? '',
          item.documentKind ?? '',
          item.confidentiality ?? '',
          ...item.tags,
        ]
          .some((value) => normalizeForSearch(value).includes(normalizedSearch));
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    const total = allItems.length;
    const start = (filters.page - 1) * filters.limit;
    const data = allItems.slice(start, start + filters.limit);

    const attachmentCount = allItems.filter((item) => item.source === 'ATTACHMENT').length;
    const mailAttachmentCount = allItems.filter((item) => item.source === 'MAIL').length;
    const totalSizeBytes = allItems.reduce((totalSize, item) => totalSize + (item.fileSize ?? 0), 0);
    const expiredCount = allItems.filter((item) => item.lifecycleStatus === 'EXPIRED').length;
    const expiringSoonCount = allItems.filter((item) => item.lifecycleStatus === 'EXPIRING_SOON').length;
    const contractCount = allItems.filter((item) => item.documentKind === 'CONTRACT').length;
    const employeeDocumentCount = allItems.filter((item) => item.documentKind === 'EMPLOYEE_DOCUMENT').length;
    const confidentialCount = allItems.filter((item) => item.confidentiality === 'CONFIDENTIAL').length;
    const oldVersionCount = allItems.filter((item) => !item.isLatestVersion).length;
    const ocrReadyCount = allItems.filter((item) => item.ocrStatus === 'TEXT_READY').length;
    const ocrProviderRequiredCount = allItems.filter((item) => item.ocrStatus === 'PROVIDER_REQUIRED').length;

    return {
      data,
      meta: {
        total,
        page: filters.page,
        pageSize: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
        summary: {
          totalDocuments: total,
          attachmentCount,
          mailAttachmentCount,
          totalSizeBytes,
          expiredCount,
          expiringSoonCount,
          contractCount,
          employeeDocumentCount,
          confidentialCount,
          oldVersionCount,
          ocrReadyCount,
          ocrProviderRequiredCount,
        },
      },
    };
  }
}
