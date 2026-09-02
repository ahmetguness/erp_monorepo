import { prisma } from '../../lib/prisma.js';
import { SalesQuoteQueries } from './application/queries/sales-quote.queries.js';
import { PrismaSalesQuoteReadRepository } from './infrastructure/persistence/prisma-sales-quote-read.repository.js';
import { SalesProcessQueries } from './application/queries/sales-process.queries.js';
import { PrismaSalesProcessReadRepository } from './infrastructure/persistence/prisma-sales-process-read.repository.js';

const salesQuoteReadRepository = new PrismaSalesQuoteReadRepository(prisma);
const salesProcessReadRepository = new PrismaSalesProcessReadRepository(prisma);

export const salesApplication = {
  salesQuoteQueries: new SalesQuoteQueries(salesQuoteReadRepository),
  salesProcessQueries: new SalesProcessQueries(salesProcessReadRepository),
} as const;
