import type { Context } from "hono";
import { getTrustedClientIpOrNull } from "../../../../../utils/request-ip.js";
import { createPlatformAudit } from "../../../platform-audit/platform-audit.service.js";
import {
  createDownloadGrant,
  createLegalHold,
  createRequest,
  createRequestSchema,
  decideRequest,
  decisionSchema,
  executeRequest,
  legalHoldSchema,
  listRequests,
  consumeDownload,
  verificationSchema,
  verifyIdentity,
} from "../../../privacy-operations/index.js";
const invalid = (c: Context, message: string) =>
  c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
export const AdminPrivacyController = {
  async list(c: Context) {
    return c.json({ data: await listRequests() });
  },
  async create(c: Context) {
    const parsed = createRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz talep.");
    return c.json(
      { data: await createRequest(parsed.data, c.get("adminId")) },
      201,
    );
  },
  async verify(c: Context) {
    const parsed = verificationSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(
        c,
        parsed.error.issues[0]?.message ?? "Kimlik kanıtı zorunlu.",
      );
    return c.json({
      data: await verifyIdentity(c.req.param("id") ?? "", c.get("adminId")),
    });
  },
  async decide(c: Context) {
    const parsed = decisionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(
        c,
        parsed.error.issues[0]?.message ?? "Karar gerekçesi zorunlu.",
      );
    return c.json({
      data: await decideRequest(
        c.req.param("id") ?? "",
        c.get("adminId"),
        parsed.data.approve,
      ),
    });
  },
  async execute(c: Context) {
    return c.json({ data: await executeRequest(c.req.param("id") ?? "") });
  },
  async grant(c: Context) {
    return c.json(
      {
        data: await createDownloadGrant(
          c.req.param("id") ?? "",
          c.get("adminId"),
        ),
      },
      201,
    );
  },
  async download(c: Context) {
    const data = await consumeDownload(c.req.param("token") ?? "");
    await createPlatformAudit({
      actorId: c.get("adminId"),
      action: "DOWNLOAD",
      module: "PRIVACY",
      targetType: "data-subject-request",
      targetId: typeof data.requestId === "string" ? data.requestId : null,
      outcome: "SUCCESS",
      ipAddress: getTrustedClientIpOrNull(c),
      device: c.req.header("user-agent") ?? null,
      requestId: (c.get("requestId") as string | undefined) ?? null,
      correlationId: c.req.header("x-correlation-id") ?? null,
    });
    return c.json({ data }, 200, {
      "content-disposition": "attachment; filename=privacy-export.json",
      "cache-control": "no-store",
    });
  },
  async hold(c: Context) {
    const parsed = legalHoldSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return invalid(
        c,
        parsed.error.issues[0]?.message ?? "Geçersiz legal hold.",
      );
    await createLegalHold(parsed.data, c.get("adminId"));
    return c.json({ data: { created: true } }, 201);
  },
};
