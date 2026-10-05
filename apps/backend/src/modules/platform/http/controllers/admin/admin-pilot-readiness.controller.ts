import { Context } from "hono";
import { NotFoundError } from "../../../../../errors/index.js";
import { prisma } from "../../../../../lib/prisma.js";
import { requireParam } from "../../../../../utils/context.js";
import { getPilotReadiness } from "../../../pilot-readiness/composition.js";

export const AdminPilotReadinessController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireParam(c, "id");
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        companyName: true,
        slug: true,
        plan: true,
        status: true,
      },
    });

    if (!tenant) {
      return c.json(new NotFoundError("Tenant", tenantId).toJSON(), 404);
    }

    const report = await getPilotReadiness(tenantId);
    return c.json({ data: { tenant, report } });
  },
};
