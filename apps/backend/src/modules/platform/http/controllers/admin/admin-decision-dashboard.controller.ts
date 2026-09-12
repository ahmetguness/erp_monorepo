import type { AdminPermission } from "@repo/types";
import type { Context } from "hono";
import {
  decisionDashboardQuerySchema,
  getAdminDecisionDashboard,
} from "../../../decision-dashboard/index.js";

export const AdminDecisionDashboardController = {
  async get(c: Context): Promise<Response> {
    const parsed = decisionDashboardQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Desteklenmeyen dashboard tarih aralığı.",
          },
        },
        400,
      );
    }
    c.header("Cache-Control", "no-store");
    const permissions: AdminPermission[] = c.get("adminPermissions") ?? [];
    return c.json({
      data: await getAdminDecisionDashboard(parsed.data.rangeDays, permissions),
    });
  },
};
