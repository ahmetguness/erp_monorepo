import { Prisma, type PrismaClient } from '@prisma/client';
import { createPageResult, type PageRequest } from '../../../shared/application/pagination.js';
import type { PayrollFilters, PayrollReadRepository } from '../../application/ports/payroll-read.repository.js';

const payrollListInclude = Prisma.validator<Prisma.PayrollInclude>()({
  employee: { select: { id: true, firstName: true, lastName: true, department: true, position: true } },
  items: true,
});
const payrollDetailInclude = Prisma.validator<Prisma.PayrollInclude>()({
  employee: { select: { id: true, firstName: true, lastName: true, department: true, position: true, salary: true } },
  items: { orderBy: { isDeduction: 'asc' } },
});

export type PayrollListRecord = Prisma.PayrollGetPayload<{ include: typeof payrollListInclude }>;
export type PayrollDetailRecord = Prisma.PayrollGetPayload<{ include: typeof payrollDetailInclude }>;

export class PrismaPayrollReadRepository
implements PayrollReadRepository<PayrollListRecord, PayrollDetailRecord> {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, filters: PayrollFilters, page: PageRequest) {
    const where: Prisma.PayrollWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.period && { period: filters.period }),
      ...(filters.employeeId && { employeeId: filters.employeeId }),
    };
    const [total, data] = await this.db.$transaction([
      this.db.payroll.count({ where }),
      this.db.payroll.findMany({
        where,
        include: payrollListInclude,
        orderBy: [{ period: 'desc' }, { employee: { lastName: 'asc' } }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
    ]);
    return createPageResult(data, total, page);
  }

  findById(tenantId: string, payrollId: string): Promise<PayrollDetailRecord | null> {
    return this.db.payroll.findFirst({
      where: { id: payrollId, tenantId, deletedAt: null },
      include: payrollDetailInclude,
    });
  }
}
