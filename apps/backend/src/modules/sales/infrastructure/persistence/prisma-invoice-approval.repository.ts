import { InvoiceStatus, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import { AccountingPostingEngineService } from '../../../../services/accounting-posting-engine.service.js';
import { writeInvoiceAccountEntry } from '../../../../utils/account-entry.js';
import type { ApproveInvoiceCommand, ApproveInvoiceResult, InvoiceApprovalRepository } from '../../application/ports/invoice-approval.repository.js';

export class PrismaInvoiceApprovalRepository implements InvoiceApprovalRepository {
  constructor(private readonly db: PrismaClient) {}

  async approve(command: ApproveInvoiceCommand): Promise<ApproveInvoiceResult> {
    try {
      return await this.db.$transaction(async (tx) => {
      const keyOwner = await tx.invoice.findFirst({
        where: { tenantId: command.tenantId, postingIdempotencyKey: command.idempotencyKey },
        select: { id: true },
      });
      if (keyOwner && keyOwner.id !== command.invoiceId) {
        throw new ConflictError('idempotencyKey baska bir fatura onayi icin kullanilmis.');
      }
      const invoice = await tx.invoice.findFirst({
        where: { id: command.invoiceId, tenantId: command.tenantId, deletedAt: null },
        include: { lines: { select: { productId: true } } },
      });
      if (!invoice) throw new NotFoundError('Fatura', command.invoiceId);
      if (invoice.postingIdempotencyKey) {
        if (invoice.postingIdempotencyKey !== command.idempotencyKey) {
          throw new ConflictError('Fatura daha once farkli bir idempotencyKey ile onaylanmis.');
        }
        const journal = await tx.journalEntry.findFirst({
          where: { tenantId: command.tenantId, refType: 'INVOICE', refId: invoice.id },
          select: { id: true },
        });
        if (!journal) throw new ConflictError('Onaylanmis faturanin muhasebe fisi bulunamadi.');
        const stockMovementCount = await tx.stockMovement.count({
          where: { tenantId: command.tenantId, idempotencyKey: { startsWith: command.idempotencyKey } },
        });
        return { invoiceId: invoice.id, status: 'SENT', journalEntryId: journal.id, stockMovementCount };
      }
      if (invoice.status !== InvoiceStatus.DRAFT) throw new ValidationError('Sadece taslak faturalar onaylanabilir.');

      const accountEntry = await tx.accountEntry.findFirst({
        where: { tenantId: command.tenantId, refType: 'INVOICE', refId: invoice.id }, select: { id: true },
      });
      if (!accountEntry) {
        await writeInvoiceAccountEntry(tx, {
          tenantId: command.tenantId, contactId: invoice.contactId, invoiceId: invoice.id,
          invoiceNumber: invoice.number, invoiceType: invoice.type, totalGross: Number(invoice.totalGross),
          date: invoice.date, userId: command.userId,
        });
      }

      const posting = await new AccountingPostingEngineService(tx).postInvoiceById(
        command.tenantId, invoice.id, command.userId, command.idempotencyKey,
      );
      if (!posting.journalEntryId || posting.status === 'FAILED') throw new ConflictError(posting.message);

      const productIds = invoice.lines.map((line) => line.productId).filter((id): id is string => id !== null);
      const linkedOrderId = invoice.salesOrderId ?? invoice.purchaseOrderId;
      const deliveryNotes = linkedOrderId ? await tx.deliveryNote.findMany({
        where: {
          tenantId: command.tenantId,
          ...(invoice.salesOrderId ? { salesOrderId: invoice.salesOrderId } : { purchaseOrderId: invoice.purchaseOrderId }),
          deletedAt: null,
        },
        select: { id: true },
      }) : [];
      const linkedMovements = productIds.length > 0 && linkedOrderId ? await tx.stockMovement.findMany({
        where: {
          tenantId: command.tenantId, productId: { in: productIds },
          OR: [
            { refType: invoice.salesOrderId ? 'SALES_ORDER' : 'PURCHASE_ORDER', refId: linkedOrderId },
            { refType: 'DELIVERY_NOTE', refId: { in: deliveryNotes.map((note) => note.id) } },
          ],
        },
        select: { productId: true },
      }) : [];
      const movedProductIds = new Set(linkedMovements.map((movement) => movement.productId));
      if (linkedOrderId && productIds.some((productId) => !movedProductIds.has(productId))) {
        throw new ConflictError('Bagli siparisin stok islemleri tamamlanmadan fatura onaylanamaz.');
      }

      const updated = await tx.invoice.updateMany({
        where: { id: invoice.id, tenantId: command.tenantId, status: InvoiceStatus.DRAFT },
        data: {
          status: InvoiceStatus.SENT,
          postingIdempotencyKey: command.idempotencyKey,
          updatedById: command.userId ?? null,
        },
      });
      if (updated.count !== 1) throw new ConflictError('Fatura es zamanli olarak degisti.');
      await tx.invoiceHistory.create({
        data: {
          tenantId: command.tenantId, invoiceId: invoice.id, fromStatus: InvoiceStatus.DRAFT,
          toStatus: InvoiceStatus.SENT, notes: 'Fatura onaylandi ve muhasebelestirildi.', createdById: command.userId ?? null,
        },
      });
      return {
        invoiceId: invoice.id, status: 'SENT', journalEntryId: posting.journalEntryId,
        stockMovementCount: linkedMovements.length,
      };
      });
    } catch (error) {
      const replay = await this.findCompletedReplay(command);
      if (replay) return replay;
      throw error;
    }
  }

  private async findCompletedReplay(command: ApproveInvoiceCommand): Promise<ApproveInvoiceResult | null> {
    const invoice = await this.db.invoice.findFirst({
      where: {
        id: command.invoiceId,
        tenantId: command.tenantId,
        postingIdempotencyKey: command.idempotencyKey,
        status: InvoiceStatus.SENT,
        deletedAt: null,
      },
      select: {
        id: true,
        salesOrderId: true,
        purchaseOrderId: true,
        lines: { select: { productId: true } },
      },
    });
    if (!invoice) return null;

    const journal = await this.db.journalEntry.findFirst({
      where: { tenantId: command.tenantId, refType: 'INVOICE', refId: invoice.id },
      select: { id: true },
    });
    if (!journal) return null;

    const linkedOrderId = invoice.salesOrderId ?? invoice.purchaseOrderId;
    const productIds = invoice.lines.map((line) => line.productId).filter((id): id is string => id !== null);
    const stockMovementCount = linkedOrderId && productIds.length > 0
      ? await this.db.stockMovement.count({
          where: {
            tenantId: command.tenantId,
            productId: { in: productIds },
            refType: invoice.salesOrderId ? 'SALES_ORDER' : 'PURCHASE_ORDER',
            refId: linkedOrderId,
          },
        })
      : 0;

    return { invoiceId: invoice.id, status: 'SENT', journalEntryId: journal.id, stockMovementCount };
  }
}
