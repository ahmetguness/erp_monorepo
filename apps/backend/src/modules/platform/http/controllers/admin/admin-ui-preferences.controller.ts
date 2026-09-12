import type { Context } from "hono";
import {
  adminUiPreferencesSchema,
  getAdminUiPreferences,
  saveAdminUiPreferences,
} from "../../../admin-ui-preferences/index.js";

const invalid = (c: Context) =>
  c.json(
    {
      error: { code: "VALIDATION_ERROR", message: "Geçersiz arayüz tercihi." },
    },
    400,
  );
export const AdminUiPreferencesController = {
  async get(c: Context): Promise<Response> {
    return c.json({ data: await getAdminUiPreferences(c.get("adminId")) });
  },
  async update(c: Context): Promise<Response> {
    const parsed = adminUiPreferencesSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return invalid(c);
    return c.json({
      data: await saveAdminUiPreferences(c.get("adminId"), parsed.data),
    });
  },
};
