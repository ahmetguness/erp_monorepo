import type { Context } from "hono";
import { ValidationError } from "../../../../../errors/index.js";
import { auditExportSchema, platformAuditFiltersSchema, retentionPolicySchema } from "../../../platform-audit/platform-audit.schemas.js";
import { createPlatformAudit, exportPlatformAudit, getPlatformAudit, listPlatformAudit, updateRetentionPolicy, verifyPlatformAuditIntegrity } from "../../../platform-audit/platform-audit.service.js";
import { getTrustedClientIpOrNull } from "../../../../../utils/request-ip.js";

const invalid = (c: Context, message: string) => c.json(new ValidationError(message).toJSON(), 400);
const queryInput = (c: Context) => ({ page: c.req.query("page"), limit: c.req.query("limit"), from: c.req.query("from"), to: c.req.query("to"), module: c.req.query("module"), actorId: c.req.query("actorId"), target: c.req.query("target"), outcome: c.req.query("outcome") });

export const AdminAuditController = {
  async list(c: Context): Promise<Response> {
    const parsed = platformAuditFiltersSchema.safeParse(queryInput(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz audit filtresi.");
    return c.json(await listPlatformAudit(parsed.data));
  },
  async detail(c: Context): Promise<Response> {
    const entry = await getPlatformAudit(c.req.param("id") ?? "");
    return entry ? c.json({ data: entry }) : c.json({ error: { code: "NOT_FOUND", message: "Platform audit kaydı bulunamadı." } }, 404);
  },
  async integrity(c: Context): Promise<Response> { return c.json({ data: await verifyPlatformAuditIntegrity() }); },
  async export(c: Context): Promise<Response> {
    const parsed = auditExportSchema.safeParse({ ...queryInput(c), format: c.req.query("format") });
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz export filtresi.");
    const { format, ...filters } = parsed.data; const result = await exportPlatformAudit(filters, format);
    await createPlatformAudit({ actorId: c.get("adminId"), action: "EXPORT", module: "AUDIT", targetType: "platform-audit", targetId: format, outcome: "SUCCESS", ipAddress: getTrustedClientIpOrNull(c), device: c.req.header("user-agent") ?? null, requestId: c.get("requestId") as string | undefined ?? null, correlationId: c.req.header("x-correlation-id") ?? null, afterValues: { format, from: filters.from?.toISOString(), to: filters.to?.toISOString(), module: filters.module, actorId: filters.actorId, target: filters.target, outcome: filters.outcome } });
    return new Response(result.body, { headers: { "content-type": result.contentType, "content-disposition": `attachment; filename="${result.filename}"` } });
  },
  async retention(c: Context): Promise<Response> {
    const parsed = retentionPolicySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz saklama politikası.");
    return c.json({ data: { retentionDays: await updateRetentionPolicy(parsed.data.retentionDays, c.get("adminId")) } });
  },
};
