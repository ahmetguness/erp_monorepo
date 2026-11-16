import { randomUUID } from 'node:crypto';
import { EDocumentStatus, EDocumentType, type Prisma } from '@prisma/client';
import { enqueueDomainEvent } from '../../domain-events/outbox.js';
import { createEventContext } from '../../domain-events/events.js';

export async function queueInvoiceDocument(tx: Prisma.TransactionClient, tenantId: string, invoiceId: string, submissionIdempotencyKey?: string): Promise<{ id: string; uuid: string; status: EDocumentStatus; }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':edocument:' + invoiceId}, 0))`;
  const invoice = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, tenantId }, include: { contact: true, eDocuments: true } });
  const existing = invoice.eDocuments[0];
  if (existing) {
    if (existing.status === EDocumentStatus.PENDING || existing.status === EDocumentStatus.PROCESSING) {
      await tx.eDocument.updateMany({ where: { id: existing.id, tenantId, status: EDocumentStatus.PENDING }, data: { status: EDocumentStatus.PROCESSING } });
      await enqueueDomainEvent(tx, { name: 'edocument.delivery.requested', context: createEventContext({ tenantId }), payload: { edocumentId: existing.id, retry: existing.retryCount } });
      return { id: existing.id, uuid: existing.uuid ?? '', status: EDocumentStatus.PROCESSING };
    }
    return { id: existing.id, uuid: existing.uuid ?? '', status: existing.status };
  }
  const type = invoice.contact.taxNumber && invoice.contact.taxNumber.length >= 10 && !invoice.contact.notes?.includes('E_ARCHIVE_ONLY') ? EDocumentType.E_INVOICE : EDocumentType.E_ARCHIVE;
  const uuid = randomUUID();
  const document = await tx.eDocument.create({
    data: {
      tenantId, invoiceId, type, uuid, providerCode: `GIB-${type}-${uuid.slice(0, 8).toUpperCase()}`,
      status: EDocumentStatus.PROCESSING, submissionIdempotencyKey: submissionIdempotencyKey ?? null,
      requestPayload: {
        invoiceNumber: invoice.number, totalGross: Number(invoice.totalGross), contactName: invoice.contact.name,
        taxNumber: invoice.contact.taxNumber, issueDate: invoice.date.toISOString()
      },
    }
  });
  await enqueueDomainEvent(tx, { name: 'edocument.delivery.requested', context: createEventContext({ tenantId }), payload: { edocumentId: document.id, retry: 0 } });
  return { id: document.id, uuid, status: document.status };
}
