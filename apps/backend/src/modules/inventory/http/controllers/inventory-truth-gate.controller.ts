import type { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId } from '../../../../utils/context.js';
import { InventoryTruthGateService } from '../../infrastructure/services/inventory-truth-gate.service.js';

export const InventoryTruthGateController = {
  async evaluate(c: Context): Promise<Response> {
    return c.json({ data: await new InventoryTruthGateService(prisma).evaluate(requireTenantId(c)) });
  },
};
