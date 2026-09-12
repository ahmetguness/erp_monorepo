import type { Context } from "hono";
import {
  bulkExecuteSchema,
  bulkPreviewSchema,
  deleteListView,
  executeBulkNote,
  exportTenantList,
  listSavedViews,
  previewBulkNote,
  saveListView,
  saveListViewSchema,
  tenantExportQuerySchema,
} from "../../../admin-list-operations/index.js";
import { createPlatformAudit } from "../../../platform-audit/platform-audit.service.js";

const invalid = (c: Context, message: string) =>
  c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
export const AdminListOperationsController = {
  async views(c: Context): Promise<Response> {
    return c.json({ data: await listSavedViews(c.get("adminId")) });
  },
  async saveView(c: Context): Promise<Response> {
    const parsed = saveListViewSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz görünüm.");
    return c.json(
      {
        data: await saveListView(
          c.get("adminId"),
          parsed.data.name,
          parsed.data.config,
        ),
      },
      201,
    );
  },
  async deleteView(c: Context): Promise<Response> {
    return (await deleteListView(c.get("adminId"), c.req.param("id") ?? ""))
      ? c.body(null, 204)
      : c.json(
          { error: { code: "NOT_FOUND", message: "Görünüm bulunamadı." } },
          404,
        );
  },
  async preview(c: Context): Promise<Response> {
    const parsed = bulkPreviewSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(c, "En az bir geçerli müşteri hesabı seçin.");
    return c.json({ data: await previewBulkNote(parsed.data.tenantIds) });
  },
  async execute(c: Context): Promise<Response> {
    const parsed = bulkExecuteSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(
        c,
        parsed.error.issues[0]?.message ?? "Geçersiz toplu işlem.",
      );
    return c.json({
      data: await executeBulkNote(
        c.get("adminId"),
        parsed.data.tenantIds,
        parsed.data.reason,
        parsed.data.note,
      ),
    });
  },
  async export(c: Context): Promise<Response> {
    const parsed = tenantExportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return invalid(c, "Geçersiz dışa aktarma filtresi.");
    const csv = await exportTenantList(c.get("adminId"), parsed.data);
    await createPlatformAudit({
      actorId: c.get("adminId"),
      action: "TENANT_LIST_EXPORTED",
      module: "TENANT",
      targetType: "TENANT_LIST",
      targetId: null,
      outcome: "SUCCESS",
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      device: c.req.header("user-agent") ?? null,
      requestId: c.req.header("x-request-id") ?? null,
      afterValues: {
        filters: parsed.data,
        exportedRows: Math.max(0, csv.split("\n").length - 1),
      },
    });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="musteri-hesaplari.csv"',
      },
    });
  },
};
