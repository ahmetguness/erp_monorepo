import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getMaintenanceManagement } from '../services/maintenance-management.service.js';

function parseHorizonDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '90', 10);
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(365, Math.max(14, parsed));
}

export const MaintenanceManagementController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getMaintenanceManagement(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
