import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { OperationsService } from "../../../../services/operations.service.js";
import { requireParam, requireTenantId } from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";

const operationsService = new OperationsService(prisma);

export const OperationsController = {
  async getHealth(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await operationsService.getOperationsHealth(tenantId);
    return c.json({ data });
  },

  async getTimeline(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const entityType = requireParam(c, "entityType");
    const entityId = requireParam(c, "entityId");
    if (
      !["SALES_ORDER", "SO", "INVOICE", "INV"].includes(
        entityType.toUpperCase(),
      )
    ) {
      throw new ValidationError("Desteklenmeyen varlik turu.");
    }
    if (entityId.length > 100)
      throw new ValidationError(
        "Varlik kimligi en fazla 100 karakter olabilir.",
      );

    const data = await operationsService.getEntityTimeline(
      tenantId,
      entityType,
      entityId,
    );
    return c.json({ data });
  },
};
