import { Prisma, QuoteStatus, type PrismaClient } from '@prisma/client';
import { createPageResult, type PageRequest } from '../../../shared/index.js';
import type { SalesQuoteFilters, SalesQuoteReadRepository } from '../../application/ports/sales-quote-read.repository.js';

const quoteListInclude = Prisma.validator<Prisma.SalesQuoteInclude>()({
  contact: { select: { id: true, name: true } },
});
const quoteDetailInclude = Prisma.validator<Prisma.SalesQuoteInclude>()({
  contact: { select: { id: true, name: true, taxNumber: true, email: true } },
  items: { include: { product: { select: { id: true, code: true, name: true } } } },
});

export type SalesQuoteListRecord = Prisma.SalesQuoteGetPayload<{ include: typeof quoteListInclude }>;
export type SalesQuoteDetailRecord = Prisma.SalesQuoteGetPayload<{ include: typeof quoteDetailInclude }>;

function parseStatus(value: string | undefined): QuoteStatus | undefined {
  return Object.values(QuoteStatus).find((status) => status === value);
}

export class PrismaSalesQuoteReadRepository
implements SalesQuoteReadRepository<SalesQuoteListRecord, SalesQuoteDetailRecord> {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, filters: SalesQuoteFilters, page: PageRequest) {
    const status = parseStatus(filters.status);
    const search = filters.search?.trim();
    const where: Prisma.SalesQuoteWhereInput = {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(filters.contactId && { contactId: filters.contactId }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' } },
          { contact: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(filters.dateFrom || filters.dateTo
        ? { date: { ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }), ...(filters.dateTo && { lte: new Date(filters.dateTo) }) } }
        : {}),
    };
    const [total, data] = await this.db.$transaction([
      this.db.salesQuote.count({ where }),
      this.db.salesQuote.findMany({
        where,
        include: quoteListInclude,
        orderBy: { date: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
    ]);
    return createPageResult(data, total, page);
  }

  findById(tenantId: string, quoteId: string): Promise<SalesQuoteDetailRecord | null> {
    return this.db.salesQuote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: quoteDetailInclude,
    });
  }
}
