import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { getAdvancedService } from "../../../../services/advanced-service.service.js";
import { requireTenantId } from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";

function parseHorizonDays(value: string | undefined): number {
  if (value === undefined) return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 7 || parsed > 180) throw new ValidationError("horizonDays 7 ile 180 arasında bir tam sayı olmalıdır.");
  return parsed;
}

export const AdvancedServiceController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query("horizonDays"));
    const data = await getAdvancedService(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
