import { AuditAction, EntityType, Prisma, type Contact, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import type { OperationRecoveryRepository, RecoveryAuditCandidate, RecoveryContext, RecoveryImpact, RecoverySnapshot, RecoveryValue } from '../../application/index.js';

function snapshot(value: Prisma.JsonValue | null): RecoverySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: RecoverySnapshot = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result[key] = item;
  }
  return result;
}

function contactSnapshot(contact: Contact): RecoverySnapshot {
  return { type: contact.type, name: contact.name, code: contact.code, taxNumber: contact.taxNumber, taxOffice: contact.taxOffice, email: contact.email, phone: contact.phone, website: contact.website, address: contact.address, city: contact.city, country: contact.country, notes: contact.notes, creditLimit: contact.creditLimit === null ? null : Number(contact.creditLimit), paymentTermDays: contact.paymentTermDays, isActive: contact.isActive };
}

function equalValue(left: RecoveryValue | undefined, right: RecoveryValue | undefined): boolean {
  return left === right || (left === undefined && right === null) || (left === null && right === undefined);
}

function assertCurrentVersion(current: RecoverySnapshot, expected: RecoverySnapshot | null): void {
  if (!expected) return;
  const changed = Object.keys(expected).some((field) => !equalValue(current[field], expected[field]));
  if (changed) throw new ConflictError('Kayıt bu işlemden sonra değiştirildi. Güncel veriyi ezmemek için geri alma durduruldu.');
}

function stringValue(value: RecoveryValue | undefined): string | null { return typeof value === 'string' ? value : null; }
function optionalNumber(value: RecoveryValue | undefined): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

export class PrismaOperationRecoveryRepository implements OperationRecoveryRepository {
  constructor(private readonly db: PrismaClient) {}

  async recordExists(context: RecoveryContext): Promise<boolean> {
    const where = { tenantId: context.tenantId, id: context.entityId };
    switch (context.entityType) {
      case 'CONTACT': return (await this.db.contact.count({ where })) > 0;
      case 'PRODUCT': return (await this.db.product.count({ where })) > 0;
      case 'INVOICE': return (await this.db.invoice.count({ where })) > 0;
      case 'SALES_ORDER': return (await this.db.salesOrder.count({ where })) > 0;
      case 'SALES_QUOTE': return (await this.db.salesQuote.count({ where })) > 0;
      case 'PURCHASE_ORDER': return (await this.db.purchaseOrder.count({ where })) > 0;
      case 'DELIVERY_NOTE': return (await this.db.deliveryNote.count({ where })) > 0;
      case 'EMPLOYEE': return (await this.db.employee.count({ where })) > 0;
      case 'CUSTOMER_ASSET': return (await this.db.customerAsset.count({ where })) > 0;
      case 'SERVICE_REQUEST': return (await this.db.serviceRequest.count({ where })) > 0;
      case 'WORK_ORDER': return (await this.db.workOrder.count({ where })) > 0;
      case 'CATEGORY': return (await this.db.category.count({ where })) > 0;
      case 'OTHER': return false;
    }
  }

  async listCandidates(context: RecoveryContext): Promise<RecoveryAuditCandidate[]> {
    const [logs, recoveryLogs] = await Promise.all([
      this.db.auditLog.findMany({ where: { tenantId: context.tenantId, entityType: context.entityType as EntityType, entityId: context.entityId, action: { in: [AuditAction.UPDATE, AuditAction.DELETE] }, module: { not: 'recovery' } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.db.auditLog.findMany({ where: { tenantId: context.tenantId, entityType: context.entityType as EntityType, entityId: context.entityId, module: 'recovery' }, select: { newValues: true, createdAt: true } }),
    ]);
    const recoveredAt = new Map<string, Date>();
    for (const log of recoveryLogs) {
      const values = snapshot(log.newValues);
      if (typeof values?.recoveryOf === 'string') recoveredAt.set(values.recoveryOf, log.createdAt);
    }
    return logs.map((log) => ({ id: log.id, action: log.action as 'UPDATE' | 'DELETE', entityType: context.entityType, entityId: log.entityId, oldValues: snapshot(log.oldValues), newValues: snapshot(log.newValues), createdAt: log.createdAt, recoveredAt: recoveredAt.get(log.id) ?? null }));
  }

  async getImpacts(context: RecoveryContext): Promise<RecoveryImpact[]> {
    if (context.entityType !== 'CONTACT') return [];
    const [invoices, salesOrders, purchaseOrders, payments] = await Promise.all([
      this.db.invoice.count({ where: { tenantId: context.tenantId, contactId: context.entityId, deletedAt: null } }),
      this.db.salesOrder.count({ where: { tenantId: context.tenantId, contactId: context.entityId, deletedAt: null } }),
      this.db.purchaseOrder.count({ where: { tenantId: context.tenantId, contactId: context.entityId, deletedAt: null } }),
      this.db.payment.count({ where: { tenantId: context.tenantId, contactId: context.entityId, deletedAt: null } }),
    ]);
    return [{ label: 'Fatura', count: invoices }, { label: 'Satış siparişi', count: salesOrders }, { label: 'Satın alma siparişi', count: purchaseOrders }, { label: 'Ödeme', count: payments }].filter((item) => item.count > 0);
  }

  async restoreContact(context: RecoveryContext, auditLogId: string, expected: RecoverySnapshot | null, restore: RecoverySnapshot, action: 'UPDATE' | 'DELETE'): Promise<void> {
    if (context.entityType !== 'CONTACT') throw new ValidationError('Bu kayıt türü için doğrudan geri alma desteklenmiyor.');
    await this.db.$transaction(async (tx) => {
      const contact = await tx.contact.findFirst({ where: { tenantId: context.tenantId, id: context.entityId } });
      if (!contact) throw new NotFoundError('Cari hesap', context.entityId);
      if (action === 'UPDATE') assertCurrentVersion(contactSnapshot(contact), expected);
      if (action === 'DELETE' && contact.deletedAt === null) throw new ConflictError('Silinen kayıt daha önce geri yüklenmiş veya yeniden oluşturulmuş.');
      const updated = await tx.contact.update({ where: { id: contact.id }, data: { name: stringValue(restore.name) ?? contact.name, code: stringValue(restore.code), taxNumber: stringValue(restore.taxNumber), taxOffice: stringValue(restore.taxOffice), email: stringValue(restore.email), phone: stringValue(restore.phone), website: stringValue(restore.website), address: stringValue(restore.address), city: stringValue(restore.city), country: stringValue(restore.country) ?? 'TR', notes: stringValue(restore.notes), creditLimit: optionalNumber(restore.creditLimit), paymentTermDays: optionalNumber(restore.paymentTermDays), isActive: typeof restore.isActive === 'boolean' ? restore.isActive : contact.isActive, ...(action === 'DELETE' && { deletedAt: null }) } });
      await tx.auditLog.create({ data: { tenantId: context.tenantId, userId: context.userId, module: 'recovery', entityType: EntityType.CONTACT, entityId: contact.id, action: AuditAction.UPDATE, oldValues: contactSnapshot(contact) as Prisma.InputJsonObject, newValues: { ...contactSnapshot(updated), recoveryOf: auditLogId } as Prisma.InputJsonObject } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
