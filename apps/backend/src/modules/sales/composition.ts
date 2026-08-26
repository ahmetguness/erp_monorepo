import { prisma } from '../../lib/prisma.js';
import { SalesQuoteQueries } from './application/queries/sales-quote.queries.js';
import { PrismaSalesQuoteReadRepository } from './infrastructure/persistence/prisma-sales-quote-read.repository.js';

const salesQuoteReadRepository = new PrismaSalesQuoteReadRepository(prisma);

export const salesApplication = {
  salesQuoteQueries: new SalesQuoteQueries(salesQuoteReadRepository),
} as const;
