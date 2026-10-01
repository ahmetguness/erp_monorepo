import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { getMaintenanceManagement } from "../../../../services/maintenance-management.service.js";
import { requireTenantId } from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";

function parseHorizonDays(value: string | undefined): number {
  if (value === undefined) return 90;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 14 || parsed > 365)
    throw new ValidationError(
      "horizonDays 14 ile 365 arasinda bir tam sayi olmalidir.",
    );
  return parsed;
}

export const MaintenanceManagementController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query("horizonDays"));
    const data = await getMaintenanceManagement(prisma, {
      tenantId,
      horizonDays,
    });
    return c.json({ data });
  },
};
