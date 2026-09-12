import { createHash } from "node:crypto";
import type { AdminPermission } from "@repo/types";
import type { Context } from "hono";
import { getTrustedClientIpOrNull } from "../../../../../utils/request-ip.js";
import {
  adminGlobalSearchSchema,
  searchAdminResources,
} from "../../../global-search/index.js";
import { createPlatformAudit } from "../../../platform-audit/platform-audit.service.js";

export const AdminGlobalSearchController = {
  async search(c: Context) {
    const parsed = adminGlobalSearchSchema.safeParse(c.req.query());
    if (!parsed.success)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Arama en az 2 karakter olmalıdır.",
          },
        },
        400,
      );
    const permissions: AdminPermission[] = c.get("adminPermissions") ?? [];
    const response = await searchAdminResources(parsed.data.q, permissions);
    await createPlatformAudit({
      actorId: c.get("adminId"),
      action: "SEARCH",
      module: "GLOBAL_SEARCH",
      targetType: "platform-resources",
      targetId: null,
      outcome: "SUCCESS",
      ipAddress: getTrustedClientIpOrNull(c),
      device: c.req.header("user-agent") ?? null,
      requestId: (c.get("requestId") as string | undefined) ?? null,
      correlationId: c.req.header("x-correlation-id") ?? null,
      afterValues: {
        queryHash: createHash("sha256")
          .update(parsed.data.q.toLowerCase())
          .digest("hex"),
        resultCount: response.results.length,
        resultKinds: [...new Set(response.results.map((item) => item.kind))],
      },
    });
    return c.json({ data: response });
  },
};
