import { prisma } from '../../lib/prisma.js';
import { SalesQuoteQueries } from './application/queries/sales-quote.queries.js';
import { PrismaSalesQuoteReadRepository } from './infrastructure/persistence/prisma-sales-quote-read.repository.js';
import { ApproveInvoice } from './application/operations/approve-invoice.js';
import { PrismaInvoiceApprovalRepository } from './infrastructure/persistence/prisma-invoice-approval.repository.js';
import { SalesProcessQueries } from './application/queries/sales-process.queries.js';
import { PrismaSalesProcessReadRepository } from './infrastructure/persistence/prisma-sales-process-read.repository.js';

const salesQuoteReadRepository = new PrismaSalesQuoteReadRepository(prisma);
const salesProcessReadRepository = new PrismaSalesProcessReadRepository(prisma);
const invoiceApprovalRepository = new PrismaInvoiceApprovalRepository(prisma);

export const salesApplication = {
  salesQuoteQueries: new SalesQuoteQueries(salesQuoteReadRepository),
  salesProcessQueries: new SalesProcessQueries(salesProcessReadRepository),
  approveInvoice: new ApproveInvoice(invoiceApprovalRepository),
} as const;
