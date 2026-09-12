import type { Context } from "hono";
import { ValidationError } from "../../../../../errors/index.js";
import {
  getOperationItem,
  interveneOperations,
} from "../../../operation-intervention/operation-intervention.service.js";
import {
  operationInterventionSchema,
  operationItemSchema,
} from "../../../operation-intervention/operation-intervention.schemas.js";

export const AdminOperationInterventionController = {
  async detail(c: Context): Promise<Response> {
    const parsed = operationItemSchema.safeParse({
      id: c.req.param("id"),
      kind: c.req.query("kind"),
    });
    if (!parsed.success)
      return c.json(
        new ValidationError(
          "Geçerli kayıt türü ve kimliği zorunludur.",
        ).toJSON(),
        400,
      );
    return c.json({ data: await getOperationItem(parsed.data, c.get("adminId")) });
  },
  async intervene(c: Context): Promise<Response> {
    const parsed = operationInterventionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        new ValidationError(
          parsed.error.issues[0]?.message ?? "Geçersiz müdahale isteği.",
        ).toJSON(),
        400,
      );
    return c.json({
      data: await interveneOperations(parsed.data, c.get("adminId")),
    });
  },
};
