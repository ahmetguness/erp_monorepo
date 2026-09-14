import type { Context } from "hono";
import { ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { getRequestMeta } from "../../../../utils/audit.js";
import { requireTenantId, requireUserId } from "../../../../utils/context.js";
import { openingBalanceInputSchema } from "../../application/opening-balances/index.js";
import { OpeningBalanceService } from "../../infrastructure/services/opening-balance.service.js";

async function readInput(c: Context) {
  const body = await c.req.json<unknown>().catch(() => null);
  const parsed = openingBalanceInputSchema.safeParse(body);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Acilis bakiyesi verisi gecersiz.",
    );
  return parsed.data;
}

export const OpeningBalanceController = {
  async preview(c: Context): Promise<Response> {
    const result = await new OpeningBalanceService(prisma).preview(
      requireTenantId(c),
      await readInput(c),
    );
    return c.json({ data: result });
  },

  async commit(c: Context): Promise<Response> {
    const result = await new OpeningBalanceService(prisma).commit(
      requireTenantId(c),
      requireUserId(c),
      await readInput(c),
      getRequestMeta(c),
    );
    return c.json({ data: result }, 201);
  },
};
