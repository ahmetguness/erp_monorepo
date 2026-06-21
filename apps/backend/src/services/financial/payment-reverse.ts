import { AuditAction, EntityType, PaymentStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../errors';
import { createAuditLog } from '../../utils/audit.js';
import { reversePaymentAccountEntry } from '../../utils/account-entry.js';
import { assertAccountingPeriodOpen, assertPaymentReversible } from './period-guard.js';

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

  await db.$transaction(async (tx) => {
    // 1. PaymentAllocation'ları sil
    await tx.paymentAllocation.deleteMany({
      where: { tenantId: input.tenantId, paymentId: input.paymentId },
    });

    // 2. Payment → CANCELLED
    const updateResult = await tx.payment.updateMany({
      where: { id: input.paymentId, tenantId: input.tenantId },
      data: {
        status: PaymentStatus.CANCELLED,
        notes: input.reason,
      },
    });
    if (updateResult.count !== 1) throw new NotFoundError('Ödeme', input.paymentId);

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
