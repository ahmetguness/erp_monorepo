import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';
import { getAdvancedPayroll } from '../services/advanced-payroll.service.js';

function requirePeriod(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    throw new ValidationError('period parametresi YYYY-MM formatinda zorunludur.');
  }
  return value;
}

export const AdvancedPayrollController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const period = requirePeriod(c.req.query('period'));
    const data = await getAdvancedPayroll(prisma, { tenantId, period });
    return c.json({ data });
  },
};
