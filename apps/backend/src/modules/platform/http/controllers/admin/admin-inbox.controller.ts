import type { AdminPermission } from "@repo/types";
import type { Context } from "hono";
import {
  getAdminInbox,
  inboxActionSchema,
  inboxFiltersSchema,
  inboxPreferencesSchema,
  updateInboxItem,
  updateInboxPreferences,
} from "../../../admin-inbox/index.js";

const invalid = (c: Context, message: string) =>
  c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);

export const AdminInboxController = {
  async list(c: Context) {
    const parsed = inboxFiltersSchema.safeParse(c.req.query());
    if (!parsed.success) return invalid(c, "Geçersiz gelen kutusu filtresi.");
    const permissions: AdminPermission[] = c.get("adminPermissions") ?? [];
    return c.json({
      data: await getAdminInbox(
        c.get("adminId"),
        permissions,
        parsed.data.scope,
        parsed.data.includeResolved,
      ),
    });
  },
  async action(c: Context) {
    const parsed = inboxActionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(
        c,
        parsed.error.issues[0]?.message ?? "Geçersiz görev aksiyonu.",
      );
    const permissions: AdminPermission[] = c.get("adminPermissions") ?? [];
    const isPersonalReadAction =
      parsed.data.action === "READ" || parsed.data.action === "UNREAD";
    if (!isPersonalReadAction && !permissions.includes("inbox.manage")) {
      return c.json(
        {
          error: { code: "FORBIDDEN", message: "Görev yönetimi yetkiniz yok." },
        },
        403,
      );
    }
    const adminId = c.get("adminId");
    const visibleInbox = await getAdminInbox(adminId, permissions, "ALL", true);
    const isAccessible = visibleInbox.items.some(
      (item) =>
        item.category === parsed.data.category &&
        item.sourceId === parsed.data.sourceId,
    );
    if (!isAccessible) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Erişilebilir görev kaydı bulunamadı.",
          },
        },
        404,
      );
    }
    await updateInboxItem(adminId, parsed.data);
    return c.json({ data: { updated: true } });
  },
  async preferences(c: Context) {
    const parsed = inboxPreferencesSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return invalid(c, "Geçersiz bildirim tercihleri.");
    await updateInboxPreferences(c.get("adminId"), parsed.data);
    return c.json({ data: { updated: true } });
  },
};
