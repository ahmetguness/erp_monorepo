import type { Context } from "hono";
import {
  completeRestoreDrill,
  completeRestoreDrillSchema,
  createRestoreDrill,
  createRestoreDrillSchema,
  getDisasterRecoveryOverview,
  recordBackupEvidence,
  recordBackupSchema,
  updateDisasterRecoveryPolicy,
  updateDisasterRecoveryPolicySchema,
} from "../../../disaster-recovery/index.js";

const invalid = (c: Context, message: string) => c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
export const AdminDisasterRecoveryController = {
  async overview(c: Context): Promise<Response> { return c.json({ data: await getDisasterRecoveryOverview() }); },
  async recordBackup(c: Context): Promise<Response> {
    const parsed = recordBackupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz yedek kanıtı.");
    return c.json({ data: await recordBackupEvidence(parsed.data, c.get("adminId")) }, 201);
  },
  async createDrill(c: Context): Promise<Response> {
    const parsed = createRestoreDrillSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz restore tatbikatı.");
    return c.json({ data: await createRestoreDrill(parsed.data, c.get("adminId")) }, 201);
  },
  async completeDrill(c: Context): Promise<Response> {
    const parsed = completeRestoreDrillSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz tatbikat sonucu.");
    return c.json({ data: await completeRestoreDrill(c.req.param("id") ?? "", parsed.data) });
  },
  async updatePolicy(c: Context): Promise<Response> {
    const parsed = updateDisasterRecoveryPolicySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz felaket kurtarma politikası.");
    await updateDisasterRecoveryPolicy(parsed.data, c.get("adminId"));
    return c.json({ data: parsed.data });
  },
};
