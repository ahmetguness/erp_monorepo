import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { getMrpPlanning } from "../../infrastructure/services/mrp-planning.service.js";
import { requireTenantId } from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";
import { InventoryTruthGateService } from "../../../inventory/index.js";

function parseHorizonDays(value: string | undefined): number {
  if (value === undefined) return 30;
  if (!/^\d+$/.test(value)) throw new ValidationError("horizonDays tam sayı olmalıdır.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 7 || parsed > 180) {
    throw new ValidationError("horizonDays 7 ile 180 arasında olmalıdır.");
  }
  return parsed;
}

export const MrpPlanningController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query("horizonDays"));
    const gate = await new InventoryTruthGateService(prisma).evaluate(tenantId);
    if (gate.decision !== "GO") {
      return c.json(
        new ValidationError(
          `MRP Inventory Truth Gate nedeniyle durduruldu: ${gate.summary.failed} hata, ${gate.summary.notTested} test edilmemis kriter.`,
        ).toJSON(),
        409,
      );
    }
    const data = await getMrpPlanning(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
