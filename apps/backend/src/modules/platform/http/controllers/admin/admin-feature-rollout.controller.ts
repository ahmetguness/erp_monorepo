import { AdminChangeRequestType } from "@prisma/client";
import type { Context } from "hono";
import { ValidationError } from "../../../../../errors/index.js";
import { submitAdminChange } from "../../../admin-change-request/admin-change-request.service.js";
import {
  createFeatureRolloutSchema,
  rolloutMetricSchema,
  rolloutStopSchema,
} from "../../../feature-rollout/feature-rollout.schemas.js";
import {
  createFeatureRollout,
  listFeatureRollouts,
  markRolloutPending,
  reportRolloutMetric,
  stopFeatureRollout,
} from "../../../feature-rollout/feature-rollout.service.js";

export const AdminFeatureRolloutController = {
  async list(c: Context): Promise<Response> {
    return c.json({ data: await listFeatureRollouts() });
  },
  async create(c: Context): Promise<Response> {
    const parsed = createFeatureRolloutSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        new ValidationError(
          parsed.error.issues[0]?.message ?? "Geçersiz rollout.",
        ).toJSON(),
        400,
      );
    return c.json(
      { data: await createFeatureRollout(c.get("adminId"), parsed.data) },
      201,
    );
  },
  async activate(c: Context): Promise<Response> {
    const id = c.req.param("id");
    if (!id)
      return c.json(
        new ValidationError("Rollout kimliği zorunludur.").toJSON(),
        400,
      );
    const rollout = (await listFeatureRollouts()).find(
      (item) => item.id === id,
    );
    if (!rollout)
      return c.json(new ValidationError("Rollout bulunamadı.").toJSON(), 404);
    const request = await submitAdminChange({
      type: AdminChangeRequestType.FEATURE_ROLLOUT_ACTIVATE,
      targetId: id,
      targetLabel: `${rollout.plan} / ${rollout.featureKey} / v${rollout.version}`,
      requiredPermission: "feature.approve",
      payload: { rolloutId: id },
      previousValues: { status: rollout.status },
      affectedTenantCount: rollout.targetTenantIds.length,
      affectedUserCount: 0,
      requestedById: c.get("adminId"),
      reason: rollout.reason,
    });
    await markRolloutPending(id);
    return c.json(
      { data: { requiresApproval: true, changeRequest: request } },
      202,
    );
  },
  async stop(c: Context): Promise<Response> {
    const id = c.req.param("id");
    if (!id)
      return c.json(
        new ValidationError("Rollout kimliği zorunludur.").toJSON(),
        400,
      );
    const parsed = rolloutStopSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        new ValidationError(
          parsed.error.issues[0]?.message ?? "Geçersiz durdurma isteği.",
        ).toJSON(),
        400,
      );
    return c.json({
      data: await stopFeatureRollout(
        id,
        c.get("adminId"),
        parsed.data.reason,
        parsed.data.killSwitch,
      ),
    });
  },
  async metric(c: Context): Promise<Response> {
    const id = c.req.param("id");
    if (!id)
      return c.json(
        new ValidationError("Rollout kimliği zorunludur.").toJSON(),
        400,
      );
    const parsed = rolloutMetricSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        new ValidationError(
          parsed.error.issues[0]?.message ?? "Geçersiz metrik.",
        ).toJSON(),
        400,
      );
    return c.json({
      data: await reportRolloutMetric(
        id,
        parsed.data.errorRatePct,
        c.get("adminId"),
      ),
    });
  },
};
