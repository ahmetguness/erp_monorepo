import { Context } from 'hono';
import { AuditAction, EntityType, FeatureKey } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// AuditLog Controller
// Starter: son 30 gün, Professional: 1 yıl, Enterprise: sınırsız
// ─────────────────────────────────────────────

const tenantFeatureService = new TenantFeatureService(prisma);
const VALID_AUDIT_ACTIONS: readonly string[] = Object.values(AuditAction);
const VALID_ENTITY_TYPES: readonly string[] = Object.values(EntityType);

function isAuditAction(value: string): value is AuditAction {
  return VALID_AUDIT_ACTIONS.includes(value);
}

function isEntityType(value: string): value is EntityType {
  return VALID_ENTITY_TYPES.includes(value);
}

/** AUDIT_LOG feature value'suna göre tarih filtresi döner */
function getAuditDateFilter(auditLevel: string): Date | null {
  const now = new Date();
  switch (auditLevel) {
    case 'basic': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case 'standard': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    case 'full':
      return null; // sınırsız
    default: {
      // bilinmeyen değer → restrictive (30 gün)
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
  }
}

function entityKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function collectEntityIds(logs: Array<{ entityType: EntityType; entityId: string }>, entityType: EntityType): string[] {
  return Array.from(new Set(logs.filter((log) => log.entityType === entityType).map((log) => log.entityId)));
}

function collectUserIds(logs: Array<{ userId: string | null }>): string[] {
  return Array.from(new Set(logs.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))));
}

async function resolveEntityLabels(
  tenantId: string,
  logs: Array<{ module: string; entityType: EntityType; entityId: string }>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  const contactIds = collectEntityIds(logs, EntityType.CONTACT);
  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true, name: true, code: true },
    });
    contacts.forEach((contact) => labels.set(entityKey(EntityType.CONTACT, contact.id), contact.code ? `${contact.code} - ${contact.name}` : contact.name));
  }

  const productIds = collectEntityIds(logs, EntityType.PRODUCT);
  if (productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, name: true, code: true },
    });
    products.forEach((product) => labels.set(entityKey(EntityType.PRODUCT, product.id), `${product.code} - ${product.name}`));
  }

  const categoryIds = collectEntityIds(logs, EntityType.CATEGORY);
  if (categoryIds.length > 0) {
    const categories = await prisma.category.findMany({
      where: { tenantId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    categories.forEach((category) => labels.set(entityKey(EntityType.CATEGORY, category.id), category.name));
  }

  const invoiceIds = collectEntityIds(logs, EntityType.INVOICE);
  if (invoiceIds.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, id: { in: invoiceIds } },
      select: { id: true, number: true },
    });
    invoices.forEach((invoice) => labels.set(entityKey(EntityType.INVOICE, invoice.id), invoice.number));
  }

  const employeeIds = collectEntityIds(logs, EntityType.EMPLOYEE);
  if (employeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    employees.forEach((employee) => labels.set(entityKey(EntityType.EMPLOYEE, employee.id), `${employee.firstName} ${employee.lastName}`));
  }

  const assetIds = collectEntityIds(logs, EntityType.CUSTOMER_ASSET);
  if (assetIds.length > 0) {
    const assets = await prisma.customerAsset.findMany({
      where: { tenantId, id: { in: assetIds } },
      select: { id: true, name: true, serialNo: true },
    });
    assets.forEach((asset) => labels.set(entityKey(EntityType.CUSTOMER_ASSET, asset.id), asset.serialNo ? `${asset.name} - ${asset.serialNo}` : asset.name));
  }

  const serviceRequestIds = collectEntityIds(logs, EntityType.SERVICE_REQUEST);
  if (serviceRequestIds.length > 0) {
    const serviceRequests = await prisma.serviceRequest.findMany({
      where: { tenantId, id: { in: serviceRequestIds } },
      select: { id: true, number: true, subject: true },
    });
    serviceRequests.forEach((request) => labels.set(entityKey(EntityType.SERVICE_REQUEST, request.id), `${request.number} - ${request.subject}`));
  }

  const purchaseOrderIds = collectEntityIds(logs, EntityType.PURCHASE_ORDER);
  if (purchaseOrderIds.length > 0) {
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId, id: { in: purchaseOrderIds } },
      select: { id: true, number: true },
    });
    orders.forEach((order) => labels.set(entityKey(EntityType.PURCHASE_ORDER, order.id), order.number));
  }

  const salesOrderIds = collectEntityIds(logs, EntityType.SALES_ORDER);
  if (salesOrderIds.length > 0) {
    const orders = await prisma.salesOrder.findMany({
      where: { tenantId, id: { in: salesOrderIds } },
      select: { id: true, number: true },
    });
    orders.forEach((order) => labels.set(entityKey(EntityType.SALES_ORDER, order.id), order.number));
  }

  const workOrderIds = collectEntityIds(logs, EntityType.WORK_ORDER);
  if (workOrderIds.length > 0) {
    const orders = await prisma.workOrder.findMany({
      where: { tenantId, id: { in: workOrderIds } },
      select: { id: true, number: true },
    });
    orders.forEach((order) => labels.set(entityKey(EntityType.WORK_ORDER, order.id), order.number));
  }

  const deliveryNoteIds = collectEntityIds(logs, EntityType.DELIVERY_NOTE);
  if (deliveryNoteIds.length > 0) {
    const notes = await prisma.deliveryNote.findMany({
      where: { tenantId, id: { in: deliveryNoteIds } },
      select: { id: true, number: true },
    });
    notes.forEach((note) => labels.set(entityKey(EntityType.DELIVERY_NOTE, note.id), note.number));
  }

  const apiKeyIds = Array.from(new Set(
    logs
      .filter((log) => log.module === 'api_keys' && log.entityType === EntityType.OTHER)
      .map((log) => log.entityId),
  ));
  if (apiKeyIds.length > 0) {
    const apiKeys = await prisma.apiKey.findMany({
      where: { tenantId, id: { in: apiKeyIds } },
      select: { id: true, name: true, keyPrefix: true },
    });
    apiKeys.forEach((apiKey) => labels.set(entityKey(EntityType.OTHER, apiKey.id), `${apiKey.name} (${apiKey.keyPrefix})`));
  }

  return labels;
}

async function resolveUserLabels(logs: Array<{ userId: string | null }>): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const userIds = collectUserIds(logs);
  if (userIds.length === 0) return labels;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  users.forEach((user) => labels.set(user.id, `${user.name} (${user.email})`));
  return labels;
}

async function enrichAuditLogs<T extends { module: string; entityType: EntityType; entityId: string; userId: string | null }>(
  tenantId: string,
  logs: T[],
): Promise<Array<T & { entityLabel: string | null; userLabel: string | null }>> {
  const [entityLabels, userLabels] = await Promise.all([
    resolveEntityLabels(tenantId, logs),
    resolveUserLabels(logs),
  ]);
  return logs.map((log) => ({
    ...log,
    entityLabel: entityLabels.get(entityKey(log.entityType, log.entityId)) ?? null,
    userLabel: log.userId ? userLabels.get(log.userId) ?? null : null,
  }));
}

export const AuditLogController = {

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
    const module = c.req.query('module');
    const entityType = c.req.query('entityType');
    const entityId = c.req.query('entityId');
    const action = c.req.query('action');
    const userId = c.req.query('userId');
    const filteredEntityType = entityType && isEntityType(entityType) ? entityType : undefined;
    const filteredAction = action && isAuditAction(action) ? action : undefined;

    // Plan bazlı tarih kısıtlaması
    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    const dateLimit = getAuditDateFilter(feature.value);

    const where = {
      tenantId,
      ...(dateLimit && { createdAt: { gte: dateLimit } }),
      ...(module && { module }),
      ...(filteredEntityType && { entityType: filteredEntityType }),
      ...(entityId && { entityId }),
      ...(filteredAction && { action: filteredAction }),
      ...(userId && { userId }),
    };

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const enrichedLogs = await enrichAuditLogs(tenantId, logs);

    return c.json({
      data: enrichedLogs,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    // Plan bazlı tarih kısıtlaması — eski kayıtlara erişimi engelle
    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    const dateLimit = getAuditDateFilter(feature.value);

    const log = await prisma.auditLog.findFirst({
      where: {
        id,
        tenantId,
        ...(dateLimit && { createdAt: { gte: dateLimit } }),
      },
    });
    if (!log) return c.json({ error: 'Kayıt bulunamadı.' }, 404);

    const [enrichedLog] = await enrichAuditLogs(tenantId, [log]);

    return c.json({ data: enrichedLog });
  },

  /**
   * GET /api/audit-logs/export
   * Enterprise (full) seviyesinde audit log'ları JSON olarak export eder.
   * Standard ve basic seviyelerde 403 döner.
   */
  async exportLogs(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    if (feature.value !== 'full') {
      return c.json(new ForbiddenError('Audit log export özelliği sadece Enterprise planında kullanılabilir.').toJSON(), 403);
    }

    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const module = c.req.query('module');

    const where = {
      tenantId,
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { ...((dateFrom ? { gte: new Date(dateFrom) } : {})), lte: new Date(dateTo) } }),
      ...(module && { module }),
    };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const enrichedLogs = await enrichAuditLogs(tenantId, logs);

    return c.json({
      data: enrichedLogs,
      meta: { total: logs.length, exportedAt: new Date().toISOString(), format: 'json' },
    });
  },
};
