import { Context } from "hono";
import { z } from "zod";
import { NotFoundError, ValidationError } from "../../../../../errors/index.js";
import { prisma } from "../../../../../lib/prisma.js";
import {
  buildDeploymentOperationsSnapshot,
  getDeploymentOperationsSettings,
  recordBackupSimulation,
  saveDeploymentOperationsSettings,
} from "../../../../../services/deployment-operations.service.js";
import { requireParam } from "../../../../../utils/context.js";

const settingsSchema = z.object({
  environmentName: z.string().trim().min(1).max(100),
  releaseChannel: z.string().trim().min(1).max(50),
  backupEnabled: z.boolean(),
  backupFrequency: z.enum(["hourly", "daily", "weekly"]),
  backupRetentionDays: z.number().int().min(1).max(3650),
  maintenanceWindow: z.string().trim().min(1).max(120),
});

async function requireSnapshot(tenantId: string) {
  const snapshot = await buildDeploymentOperationsSnapshot(prisma, tenantId);
  if (!snapshot) throw new NotFoundError("Tenant", tenantId);
  return snapshot;
}

export const AdminDeploymentOperationsController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireParam(c, "id");
    return c.json({
      data: {
        snapshot: await requireSnapshot(tenantId),
        settings: await getDeploymentOperationsSettings(prisma, tenantId),
      },
    });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireParam(c, "id");
    await requireSnapshot(tenantId);
    const parsed = settingsSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        new ValidationError("Deployment operasyon ayarları geçersiz.").toJSON(),
        400,
      );
    await saveDeploymentOperationsSettings(prisma, tenantId, {
      ...parsed.data,
      backupLastRunAt: null,
      backupLastStatus: null,
    });
    return c.json({ data: { success: true } });
  },

  async simulateBackup(c: Context): Promise<Response> {
    const tenantId = requireParam(c, "id");
    await requireSnapshot(tenantId);
    const result = await recordBackupSimulation(prisma, tenantId);
    return c.json({
      data: { ...result, snapshot: await requireSnapshot(tenantId) },
    });
  },
};
