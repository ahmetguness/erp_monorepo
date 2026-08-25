import { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getAdvancedPayroll } from '../../../../services/advanced-payroll.service.js';
import { requireTenantId } from '../../../../utils/context.js';

function requirePeriod(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    throw new ValidationError('period parametresi YYYY-MM formatinda zorunludur.');
  }
  return value;
}

export const AdvancedPayrollController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const period = requirePeriod(c.req.query('period'));
    const data = await getAdvancedPayroll(prisma, { tenantId, period, userId });
    return c.json({ data });
  },
};
