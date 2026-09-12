import type { Context } from "hono";
import { ValidationError } from "../../../../../errors/index.js";
import { getTrustedClientIpOrNull } from "../../../../../utils/request-ip.js";
import { createSensitiveAccessGrant, createSensitiveAccessGrantSchema } from "../../../sensitive-data/index.js";
export const AdminSensitiveDataController = {
  async create(c: Context): Promise<Response> {
    const parsed = createSensitiveAccessGrantSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(new ValidationError(parsed.error.issues[0]?.message ?? "Erişim amacı geçersiz.").toJSON(), 400);
    return c.json({ data: await createSensitiveAccessGrant(c.get("adminId"), parsed.data, { ipAddress: getTrustedClientIpOrNull(c), device: c.req.header("user-agent") ?? null, requestId: c.get("requestId") ?? null }) }, 201);
  },
};
