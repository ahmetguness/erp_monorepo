import { prisma } from '../../lib/prisma.js';
import { PaymentQueries } from './application/queries/payment.queries.js';
import { PrismaPaymentReadRepository } from './infrastructure/persistence/prisma-payment-read.repository.js';
import { createPayment } from '../../services/payment.service.js';

const paymentReadRepository = new PrismaPaymentReadRepository(prisma);

export const financeApplication = {
  paymentQueries: new PaymentQueries(paymentReadRepository),
  createPayment: (options: Parameters<typeof createPayment>[0]) => createPayment(options, prisma),
} as const;
