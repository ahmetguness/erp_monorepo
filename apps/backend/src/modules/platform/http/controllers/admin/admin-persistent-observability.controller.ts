import type { Context } from "hono";
import { ValidationError } from "../../../../../errors/index.js";
import { alertOwnershipSchema, alertSilenceSchema, deploymentSchema, observabilityRangeSchema, sloSchema } from "../../../persistent-observability/persistent-observability.schemas.js";
import { prisma } from "../../../../../lib/prisma.js";
import { getObservabilitySnapshot } from "../../../../../services/observability.service.js";
import { capturePersistentSnapshot, createDeployment, getPersistentDashboard, silenceAlert, updateAlertOwnership, upsertSlo } from "../../../persistent-observability/persistent-observability.service.js";

const invalid = (c: Context, message: string) => c.json(new ValidationError(message).toJSON(), 400);
export const AdminPersistentObservabilityController = {
  async dashboard(c: Context): Promise<Response> {
    const range = observabilityRangeSchema.safeParse(c.req.query("range") ?? "24h");
    if (!range.success) return invalid(c, "Geçerli aralık seçiniz: 1h, 24h, 7d, 30d.");
    await capturePersistentSnapshot(await getObservabilitySnapshot(prisma));
    return c.json({ data: await getPersistentDashboard(range.data) });
  },
  async slo(c: Context): Promise<Response> {
    const parsed = sloSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz SLO.");
    return c.json({ data: await upsertSlo(parsed.data) });
  },
  async ownership(c: Context): Promise<Response> {
    const parsed = alertOwnershipSchema.safeParse(await c.req.json().catch(() => null));
    const id = c.req.param("id");
    if (!parsed.success || !id) return invalid(c, parsed.error?.issues[0]?.message ?? "Alarm kimliği zorunludur.");
    return c.json({ data: await updateAlertOwnership(id, c.get("adminId"), parsed.data) });
  },
  async silence(c: Context): Promise<Response> {
    const parsed = alertSilenceSchema.safeParse(await c.req.json().catch(() => null));
    const id = c.req.param("id");
    if (!parsed.success || !id) return invalid(c, parsed.error?.issues[0]?.message ?? "Alarm kimliği zorunludur.");
    if (parsed.data.until <= new Date()) return invalid(c, "Susturma bitişi gelecekte olmalıdır.");
    return c.json({ data: await silenceAlert(id, c.get("adminId"), parsed.data.until, parsed.data.reason) });
  },
  async deployment(c: Context): Promise<Response> {
    const parsed = deploymentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz deploy işareti.");
    return c.json({ data: await createDeployment(parsed.data, c.get("adminId")) }, 201);
  },
};
