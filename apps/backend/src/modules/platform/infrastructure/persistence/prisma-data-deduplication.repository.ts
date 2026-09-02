import { AuditAction, EntityType, Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../../../errors/index.js';
import { findDuplicateCandidates, type ContactFieldWinners, type ContactMergePlan, type ContactMergeResult, type ContactMergeRollbackResult, type DataDeduplicationRepository, type DedupEntity, type DedupRecord } from '../../application/data-deduplication/index.js';

const CONTACT_FIELDS = ['name', 'taxNumber', 'taxOffice', 'email', 'phone', 'website', 'address', 'city', 'country', 'notes', 'creditLimit', 'paymentTermDays'] as const;
type ContactField = typeof CONTACT_FIELDS[number];
type ContactSnapshot = { id: string; label: string; values: Record<ContactField, string | number | null> };
type ReferenceSnapshot = Record<string, string[]>;

const rollbackSnapshotSchema = z.object({
  source: z.object({ id: z.string(), values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) }),
  target: z.object({ id: z.string(), values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) }),
  references: z.record(z.string(), z.array(z.string())),
});
const mergeResultSnapshotSchema = z.object({
  operation: z.literal('CONTACT_MERGE'),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

function scalar(value: Prisma.Decimal | string | number | null): string | number | null {
  return value instanceof Prisma.Decimal ? value.toString() : value;
}

function contactSnapshot(contact: {
  id: string; name: string; taxNumber: string | null; taxOffice: string | null; email: string | null; phone: string | null;
  website: string | null; address: string | null; city: string | null; country: string; notes: string | null;
  creditLimit: Prisma.Decimal | null; paymentTermDays: number | null;
}): ContactSnapshot {
  return { id: contact.id, label: contact.name, values: {
    name: contact.name, taxNumber: contact.taxNumber, taxOffice: contact.taxOffice,
    email: contact.email, phone: contact.phone, website: contact.website, address: contact.address, city: contact.city,
    country: contact.country, notes: contact.notes, creditLimit: scalar(contact.creditLimit), paymentTermDays: contact.paymentTermDays,
  } };
}

function mergedValues(source: ContactSnapshot, target: ContactSnapshot, winners: ContactFieldWinners): Record<ContactField, string | number | null> {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, winners[field] === 'source' ? source.values[field] : target.values[field] ?? source.values[field]])) as Record<ContactField, string | number | null>;
}

function assertMergeCandidate(source: ContactSnapshot, target: ContactSnapshot): void {
  const records: DedupRecord[] = [source, target];
  if (findDuplicateCandidates('contacts', records, 0.15).length === 0) {
    throw new ValidationError('Bu cariler belirlenen mükerrer eşleşme eşiğini karşılamıyor.');
  }
}

async function loadContact(db: PrismaClient | Prisma.TransactionClient, tenantId: string, id: string) {
  const contact = await db.contact.findFirst({ where: { tenantId, id, deletedAt: null, isActive: true }, select: { id: true, name: true, taxNumber: true, taxOffice: true, email: true, phone: true, website: true, address: true, city: true, country: true, notes: true, creditLimit: true, paymentTermDays: true } });
  if (!contact) throw new NotFoundError('Cari', id);
  return contactSnapshot(contact);
}

function sameContactValues(actual: ContactSnapshot['values'], expected: Readonly<Record<string, string | number | null>>): boolean {
  return CONTACT_FIELDS.every((field) => String(actual[field] ?? '') === String(expected[field] ?? ''));
}

async function referenceSnapshot(db: PrismaClient | Prisma.TransactionClient, tenantId: string, contactId: string): Promise<ReferenceSnapshot> {
  const select = { id: true } as const;
  const [salesQuotes, salesOrders, purchaseOrders, invoices, accountEntries, serviceRequests, customerAssets, payments, deliveryNotes, collectionReminders, checkPromissoryNotes, attachments, tasks] = await Promise.all([
    db.salesQuote.findMany({ where: { tenantId, contactId }, select }), db.salesOrder.findMany({ where: { tenantId, contactId }, select }),
    db.purchaseOrder.findMany({ where: { tenantId, contactId }, select }), db.invoice.findMany({ where: { tenantId, contactId }, select }),
    db.accountEntry.findMany({ where: { tenantId, contactId }, select }), db.serviceRequest.findMany({ where: { tenantId, contactId }, select }),
    db.customerAsset.findMany({ where: { tenantId, contactId }, select }), db.payment.findMany({ where: { tenantId, contactId }, select }),
    db.deliveryNote.findMany({ where: { tenantId, contactId }, select }), db.collectionReminder.findMany({ where: { tenantId, contactId }, select }),
    db.checkPromissoryNote.findMany({ where: { tenantId, contactId }, select }),
    db.attachment.findMany({ where: { tenantId, entityType: EntityType.CONTACT, entityId: contactId }, select }),
    db.task.findMany({ where: { tenantId, entityType: EntityType.CONTACT, entityId: contactId }, select }),
  ]);
  const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id);
  return { salesQuotes: ids(salesQuotes), salesOrders: ids(salesOrders), purchaseOrders: ids(purchaseOrders), invoices: ids(invoices), accountEntries: ids(accountEntries), serviceRequests: ids(serviceRequests), customerAssets: ids(customerAssets), payments: ids(payments), deliveryNotes: ids(deliveryNotes), collectionReminders: ids(collectionReminders), checkPromissoryNotes: ids(checkPromissoryNotes), attachments: ids(attachments), tasks: ids(tasks) };
}

function referenceCounts(snapshot: ReferenceSnapshot): Record<string, number> {
  return Object.fromEntries(Object.entries(snapshot).map(([key, ids]) => [key, ids.length]));
}

async function moveReferences(tx: Prisma.TransactionClient, tenantId: string, snapshot: ReferenceSnapshot, contactId: string): Promise<void> {
  const where = (key: string) => ({ tenantId, id: { in: snapshot[key] ?? [] } });
  await Promise.all([
    tx.salesQuote.updateMany({ where: where('salesQuotes'), data: { contactId } }), tx.salesOrder.updateMany({ where: where('salesOrders'), data: { contactId } }),
    tx.purchaseOrder.updateMany({ where: where('purchaseOrders'), data: { contactId } }), tx.invoice.updateMany({ where: where('invoices'), data: { contactId } }),
    tx.accountEntry.updateMany({ where: where('accountEntries'), data: { contactId } }), tx.serviceRequest.updateMany({ where: where('serviceRequests'), data: { contactId } }),
    tx.customerAsset.updateMany({ where: where('customerAssets'), data: { contactId } }), tx.payment.updateMany({ where: where('payments'), data: { contactId } }),
    tx.deliveryNote.updateMany({ where: where('deliveryNotes'), data: { contactId } }), tx.collectionReminder.updateMany({ where: where('collectionReminders'), data: { contactId } }),
    tx.checkPromissoryNote.updateMany({ where: where('checkPromissoryNotes'), data: { contactId } }),
    tx.attachment.updateMany({ where: where('attachments'), data: { entityId: contactId } }), tx.task.updateMany({ where: where('tasks'), data: { entityId: contactId } }),
  ]);
}

function asContactUpdate(values: Readonly<Record<ContactField, string | number | null>>): Prisma.ContactUpdateManyMutationInput {
  return {
    name: String(values.name ?? ''), taxNumber: values.taxNumber === null ? null : String(values.taxNumber), taxOffice: values.taxOffice === null ? null : String(values.taxOffice),
    email: values.email === null ? null : String(values.email), phone: values.phone === null ? null : String(values.phone), website: values.website === null ? null : String(values.website),
    address: values.address === null ? null : String(values.address), city: values.city === null ? null : String(values.city), country: String(values.country ?? 'TR'), notes: values.notes === null ? null : String(values.notes),
    creditLimit: values.creditLimit === null ? null : new Prisma.Decimal(values.creditLimit), paymentTermDays: values.paymentTermDays === null ? null : Number(values.paymentTermDays),
  };
}

export class PrismaDataDeduplicationRepository implements DataDeduplicationRepository {
  constructor(private readonly db: PrismaClient) {}

  async listRecords(tenantId: string, entity: DedupEntity): Promise<DedupRecord[]> {
    if (entity === 'contacts') {
      return (await this.db.contact.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true, taxNumber: true, email: true, phone: true }, orderBy: { updatedAt: 'desc' }, take: 500 })).map((row) => ({ id: row.id, label: row.name, values: { name: row.name, taxNumber: row.taxNumber, email: row.email, phone: row.phone } }));
    }
    if (entity === 'products') {
      return (await this.db.product.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, barcode: true }, orderBy: { updatedAt: 'desc' }, take: 500 })).map((row) => ({ id: row.id, label: `${row.code} - ${row.name}`, values: { code: row.code, name: row.name, barcode: row.barcode } }));
    }
    return (await this.db.invoice.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, number: true, totalGross: true, contact: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 500 })).map((row) => ({ id: row.id, label: row.number, values: { number: row.number, contactName: row.contact.name, totalGross: Number(row.totalGross) } }));
  }

  async previewContactMerge(tenantId: string, sourceId: string, targetId: string, fieldWinners: ContactFieldWinners): Promise<ContactMergePlan> {
    const [source, target, references] = await Promise.all([loadContact(this.db, tenantId, sourceId), loadContact(this.db, tenantId, targetId), referenceSnapshot(this.db, tenantId, sourceId)]);
    assertMergeCandidate(source, target);
    const counts = referenceCounts(references);
    return { source, target, fieldWinners, mergedValues: mergedValues(source, target, fieldWinners), references: counts, totalReferences: Object.values(counts).reduce((sum, count) => sum + count, 0), warnings: ['Kaynak cari pasif ve silinmiş olarak işaretlenecek.', 'Yalnızca önizlemede listelenen referanslar hedef cariye taşınacak.'], rollbackSupported: true };
  }

  async mergeContacts(context: { tenantId: string; userId: string; ipAddress: string | null; userAgent: string | null }, sourceId: string, targetId: string, fieldWinners: ContactFieldWinners): Promise<ContactMergeResult> {
    return this.db.$transaction(async (tx) => {
      const [source, target, references] = await Promise.all([loadContact(tx, context.tenantId, sourceId), loadContact(tx, context.tenantId, targetId), referenceSnapshot(tx, context.tenantId, sourceId)]);
      assertMergeCandidate(source, target);
      const values = mergedValues(source, target, fieldWinners);
      await tx.contact.updateMany({ where: { tenantId: context.tenantId, id: targetId, deletedAt: null }, data: { ...asContactUpdate(values), updatedById: context.userId } });
      await moveReferences(tx, context.tenantId, references, targetId);
      await tx.contact.updateMany({ where: { tenantId: context.tenantId, id: sourceId, deletedAt: null }, data: { isActive: false, deletedAt: new Date(), updatedById: context.userId } });
      const log = await tx.auditLog.create({ data: { tenantId: context.tenantId, userId: context.userId, module: 'data-deduplication', entityType: EntityType.CONTACT, entityId: targetId, action: AuditAction.UPDATE, oldValues: { source: { id: sourceId, values: source.values }, target: { id: targetId, values: target.values }, references }, newValues: { operation: 'CONTACT_MERGE', sourceId, targetId, values }, ipAddress: context.ipAddress, userAgent: context.userAgent }, select: { id: true } });
      const counts = referenceCounts(references);
      return { source, target, fieldWinners, mergedValues: values, references: counts, totalReferences: Object.values(counts).reduce((sum, count) => sum + count, 0), warnings: [], rollbackSupported: true, auditLogId: log.id, mergedAt: new Date().toISOString() };
    });
  }

  async rollbackContactMerge(context: { tenantId: string; userId: string; ipAddress: string | null; userAgent: string | null }, auditLogId: string): Promise<ContactMergeRollbackResult> {
    return this.db.$transaction(async (tx) => {
      const log = await tx.auditLog.findFirst({ where: { tenantId: context.tenantId, id: auditLogId, module: 'data-deduplication', entityType: EntityType.CONTACT }, select: { oldValues: true, newValues: true, entityId: true } });
      if (!log) throw new NotFoundError('Birleştirme audit kaydı', auditLogId);
      const parsed = rollbackSnapshotSchema.safeParse(log.oldValues);
      if (!parsed.success) throw new ValidationError('Birleştirme snapshot verisi geri alma için geçersiz.');
      const mergeResult = mergeResultSnapshotSchema.safeParse(log.newValues);
      if (!mergeResult.success) throw new ValidationError('Birleştirme sonuç snapshot verisi geri alma için geçersiz.');
      const { source, target, references } = parsed.data;
      const sourceExists = await tx.contact.findFirst({ where: { tenantId: context.tenantId, id: source.id }, select: { id: true, deletedAt: true, isActive: true } });
      if (!sourceExists) throw new ValidationError('Kaynak cari kalıcı olarak silinmiş; geri alma yapılamaz.');
      if (sourceExists.deletedAt === null || sourceExists.isActive) throw new ValidationError('Bu birleştirme daha önce geri alınmış veya kaynak cari yeniden etkinleştirilmiş.');
      const currentTarget = await loadContact(tx, context.tenantId, target.id);
      if (!sameContactValues(currentTarget.values, mergeResult.data.values)) {
        throw new ValidationError('Hedef cari birleştirme sonrasında değiştirildi. Güncel veriyi ezmemek için otomatik geri alma durduruldu.');
      }
      await tx.contact.updateMany({ where: { tenantId: context.tenantId, id: source.id }, data: { ...asContactUpdate(source.values as Record<ContactField, string | number | null>), isActive: true, deletedAt: null, updatedById: context.userId } });
      await tx.contact.updateMany({ where: { tenantId: context.tenantId, id: target.id, deletedAt: null }, data: { ...asContactUpdate(target.values as Record<ContactField, string | number | null>), updatedById: context.userId } });
      await moveReferences(tx, context.tenantId, references, source.id);
      const restoredReferences = Object.values(references).reduce((sum, ids) => sum + ids.length, 0);
      await tx.auditLog.create({ data: { tenantId: context.tenantId, userId: context.userId, module: 'data-deduplication', entityType: EntityType.CONTACT, entityId: source.id, action: AuditAction.UPDATE, oldValues: { mergeAuditLogId: auditLogId }, newValues: { operation: 'CONTACT_MERGE_ROLLBACK', restoredReferences }, ipAddress: context.ipAddress, userAgent: context.userAgent } });
      return { auditLogId, restoredSourceId: source.id, targetId: target.id, restoredReferences, rolledBackAt: new Date().toISOString() };
    });
  }
}
