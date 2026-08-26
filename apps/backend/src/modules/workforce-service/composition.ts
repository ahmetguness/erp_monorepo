import { prisma } from '../../lib/prisma.js';
import { PayrollQueries } from './application/queries/payroll.queries.js';
import { PrismaPayrollReadRepository } from './infrastructure/persistence/prisma-payroll-read.repository.js';

const payrollReadRepository = new PrismaPayrollReadRepository(prisma);

export const workforceApplication = {
  payrollQueries: new PayrollQueries(payrollReadRepository),
} as const;
