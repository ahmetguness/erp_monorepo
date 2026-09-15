import type { Context } from "hono";
import { prisma } from "../../../../../lib/prisma.js";
import { requireTenantId } from "../../../../../utils/context.js";
import { BasicDashboardService } from "../basic-dashboard.service.js";

const service = new BasicDashboardService(prisma);

export const BasicDashboardController = {
  async executive(context: Context): Promise<Response> {
    return context.json({
      data: await service.executive(requireTenantId(context)),
    });
  },
  async production(context: Context): Promise<Response> {
    return context.json({
      data: await service.production(requireTenantId(context)),
    });
  },
  async procurement(context: Context): Promise<Response> {
    return context.json({
      data: await service.procurement(requireTenantId(context)),
    });
  },
};
