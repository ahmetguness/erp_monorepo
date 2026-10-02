import { AuditAction, EntityType, PaymentStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../errors';
import { createAuditLog } from '../../utils/audit.js';
import { reversePaymentAccountEntry } from '../../utils/account-entry.js';
import { assertAccountingPeriodOpen, assertPaymentReversible } from './period-guard.js';
import { recomputeInvoiceStatus } from './invoice-status.service.js';

// ─────────────────────────────────────────────
// Payment Reverse
// Tamamlanmış ödemeyi iptal eder:
//   1. Payment.status → CANCELLED
//   2. PaymentAllocation'lar silinir
//   3. AccountEntry ters kaydı yazılır
//   4. Kapalı dönem kilidi kontrol edilir
//   5. AuditLog yazılır
// ─────────────────────────────────────────────

export interface ReversePaymentInput {
  tenantId: string;
  userId: string | null | undefined;
  paymentId: string;
  reason: string;
  auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
}

export async function reversePayment(db: PrismaClient, input: ReversePaymentInput): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { id: input.paymentId, tenantId: input.tenantId, deletedAt: null },
    select: {
      id: true,
      status: true,
      date: true,
      amount: true,
      contactId: true,
      reference: true,
    },
  });

  if (!payment) throw new NotFoundError('Ödeme', input.paymentId);

  // Sadece COMPLETED ödemeler ters kayıt alabilir
  assertPaymentReversible(payment, 'Ödeme iptali');

  // Dönem kilidi kontrolü — ters kayıt bugünün tarihiyle yapılır
  const reversalDate = new Date();
  await assertAccountingPeriodOpen(db, input.tenantId, reversalDate, 'Ödeme iptali');

  const invoiceIds = await db.paymentAllocation.findMany({
    where: { tenantId: input.tenantId, paymentId: input.paymentId },
    select: { invoiceId: true },
  });

  await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: input.paymentId, tenantId: input.tenantId, status: PaymentStatus.COMPLETED },
      data: { status: PaymentStatus.CANCELLED, notes: input.reason },
    });
    if (claimed.count !== 1) throw new ConflictError('Ödeme başka bir işlem tarafından zaten iptal edildi.');

    // 1. PaymentAllocation'ları sil
    await tx.paymentAllocation.deleteMany({
      where: { tenantId: input.tenantId, paymentId: input.paymentId },
    });

    // 2. Recompute invoice state after allocations are removed.
    for (const { invoiceId } of invoiceIds) {
      await recomputeInvoiceStatus(tx, input.tenantId, invoiceId, {
        userId: input.userId,
        note: `Ödeme iptali sonrası otomatik durum hesaplandı: ${input.paymentId}`,
      });
    }

    // 3. AccountEntry ters kaydı (sadece cari bağlıysa)
    if (payment.contactId) {
      await reversePaymentAccountEntry(tx, {
        tenantId: input.tenantId,
        contactId: payment.contactId,
        paymentId: input.paymentId,
        reference: payment.reference,
        amount: payment.amount.toNumber(),
        date: reversalDate,
        reason: input.reason,
        userId: input.userId,
      });
    }
  });

  // 4. Audit log (transaction dışı)
  await createAuditLog(db, {
    tenantId: input.tenantId,
    userId: input.userId,
    module: 'accounting',
    entityType: EntityType.OTHER,
    entityId: input.paymentId,
    action: AuditAction.UPDATE,
    oldValues: { status: payment.status },
    newValues: { status: PaymentStatus.CANCELLED, reason: input.reason },
    ipAddress: input.auditMeta?.ipAddress,
    userAgent: input.auditMeta?.userAgent,
  });
}
