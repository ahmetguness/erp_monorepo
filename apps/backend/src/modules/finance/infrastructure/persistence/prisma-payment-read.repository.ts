import { PaymentStatus, Prisma, type PrismaClient } from '@prisma/client';
import { createPageResult, type PageRequest } from '../../../shared/index.js';
import type { PaymentFilters, PaymentReadRepository } from '../../application/ports/payment-read.repository.js';

const paymentInclude = Prisma.validator<Prisma.PaymentInclude>()({
  contact: { select: { id: true, name: true } },
  bankAccount: { select: { id: true, name: true } },
  cashAccount: { select: { id: true, name: true } },
  allocations: { include: { invoice: { select: { id: true, number: true, totalGross: true } } } },
});

export type PaymentListRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
export type PaymentDetailRecord = PaymentListRecord;

function parseStatus(value: string | undefined): PaymentStatus | undefined {
  return Object.values(PaymentStatus).find((status) => status === value);
}

export class PrismaPaymentReadRepository
implements PaymentReadRepository<PaymentListRecord, PaymentDetailRecord> {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, filters: PaymentFilters, page: PageRequest) {
    const status = parseStatus(filters.status);
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.contactId && { contactId: filters.contactId }),
      ...(status && { status }),
      ...(filters.dateFrom || filters.dateTo
        ? { date: { ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }), ...(filters.dateTo && { lte: new Date(filters.dateTo) }) } }
        : {}),
    };
    const [total, data] = await this.db.$transaction([
      this.db.payment.count({ where }),
      this.db.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { date: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
    ]);
    return createPageResult(data, total, page);
  }

  findById(tenantId: string, paymentId: string): Promise<PaymentDetailRecord | null> {
    return this.db.payment.findFirst({
      where: { id: paymentId, tenantId, deletedAt: null },
      include: paymentInclude,
    });
  }
}
