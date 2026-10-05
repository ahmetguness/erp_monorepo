import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { IntegrityAutomationService } from "../../../../services/integrity-automation.service.js";
import {
  requireParam,
  requireTenantId,
  requireUserId,
} from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";

function parseScanBody(value: unknown): { autoFix: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ValidationError("Gecersiz istek govdesi.");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => key !== "autoFix") ||
    (body.autoFix !== undefined && typeof body.autoFix !== "boolean")
  ) {
    throw new ValidationError("autoFix boolean olmalidir.");
  }
  return { autoFix: body.autoFix ?? true };
}

const integrityService = new IntegrityAutomationService(prisma);

export const IntegrityController = {
  async runScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parseScanBody(await c.req.json<unknown>());

    const data = await integrityService.runIntegrityCheck(tenantId, body);
    return c.json({ data });
  },

  async resolveException(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, "id");
    if (id.length > 160) throw new ValidationError("Istisna kimligi cok uzun.");
    const value = await c.req.json<unknown>();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new ValidationError("Gecersiz istek govdesi.");
    const body = value as Record<string, unknown>;
    if (
      Object.keys(body).some((key) => key !== "notes") ||
      (body.notes !== undefined && typeof body.notes !== "string")
    ) {
      throw new ValidationError("notes metin olmalidir.");
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (notes.length > 500)
      throw new ValidationError("notes en fazla 500 karakter olabilir.");

    const result = await integrityService.resolveExceptionItem(
      tenantId,
      userId,
      id,
      notes || "Manuel inceleme tamamlandi.",
    );
    return c.json({ data: result });
  },
};
