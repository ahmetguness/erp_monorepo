import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { getMrpPlanning } from "../../infrastructure/services/mrp-planning.service.js";
import { requireTenantId } from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";
import { InventoryTruthGateService } from "../../../inventory/index.js";

function parseHorizonDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "30", 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(180, Math.max(7, parsed));
}

export const MrpPlanningController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const gate = await new InventoryTruthGateService(prisma).evaluate(tenantId);
    if (gate.decision !== "GO") {
      return c.json(
        new ValidationError(
          `MRP Inventory Truth Gate nedeniyle durduruldu: ${gate.summary.failed} hata, ${gate.summary.notTested} test edilmemis kriter.`,
        ).toJSON(),
        409,
      );
    }
    const horizonDays = parseHorizonDays(c.req.query("horizonDays"));
    const data = await getMrpPlanning(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
