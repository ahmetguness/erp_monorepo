import { Context } from "hono";
import { NotFoundError, ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import {
  createFieldServiceCheckpoint,
  getFieldServiceMobileFlow,
  type FieldServiceCheckpointKind,
} from "../../../../services/field-service-mobile.service.js";
import { requireParam, requireTenantId } from "../../../../utils/context.js";

const CHECKPOINT_KINDS: readonly FieldServiceCheckpointKind[] = [
  "SERVICE_FORM",
  "CUSTOMER_APPROVAL",
  "VISIT_NOTE",
];

function parseCheckpointKind(value: unknown): FieldServiceCheckpointKind {
  if (
    typeof value === "string" &&
    CHECKPOINT_KINDS.includes(value as FieldServiceCheckpointKind)
  ) {
    return value as FieldServiceCheckpointKind;
  }
  throw new ValidationError(
    "kind SERVICE_FORM, CUSTOMER_APPROVAL veya VISIT_NOTE olmalidir.",
  );
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength)
    throw new ValidationError(
      `${field} en fazla ${maxLength} karakter olabilir.`,
    );
  return trimmed.length > 0 ? trimmed : undefined;
}

export const FieldServiceMobileController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const assignedToId = optionalString(
      c.req.query("assignedToId"),
      "assignedToId",
      100,
    );
    const data = await getFieldServiceMobileFlow(prisma, {
      tenantId,
      assignedToId,
    });
    return c.json({ data });
  },

  async checkpoint(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const serviceRequestId = requireParam(c, "id");
    const body = await c.req
      .json<{
        kind?: unknown;
        note?: unknown;
        customerName?: unknown;
      }>()
      .catch(() => {
        throw new ValidationError("Gecersiz JSON govdesi.");
      });

    try {
      const data = await createFieldServiceCheckpoint(prisma, {
        tenantId,
        serviceRequestId,
        kind: parseCheckpointKind(body.kind),
        note: optionalString(body.note, "note", 2000),
        customerName: optionalString(body.customerName, "customerName", 100),
      });
      return c.json({ data }, 201);
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      if (
        error instanceof Error &&
        error.message === "SERVICE_REQUEST_NOT_FOUND"
      ) {
        return c.json(
          new NotFoundError("Servis Talebi", serviceRequestId).toJSON(),
          404,
        );
      }
      throw error;
    }
  },
};
