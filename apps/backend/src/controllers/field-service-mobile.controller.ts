import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireParam, requireTenantId } from '../utils/context.js';
import {
  createFieldServiceCheckpoint,
  getFieldServiceMobileFlow,
  type FieldServiceCheckpointKind,
} from '../services/field-service-mobile.service.js';

const CHECKPOINT_KINDS: readonly FieldServiceCheckpointKind[] = [
  'SERVICE_FORM',
  'CUSTOMER_APPROVAL',
  'VISIT_NOTE',
];

function parseCheckpointKind(value: unknown): FieldServiceCheckpointKind {
  if (typeof value === 'string' && CHECKPOINT_KINDS.includes(value as FieldServiceCheckpointKind)) {
    return value as FieldServiceCheckpointKind;
  }
  throw new ValidationError('kind SERVICE_FORM, CUSTOMER_APPROVAL veya VISIT_NOTE olmalidir.');
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const FieldServiceMobileController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const assignedToId = optionalString(c.req.query('assignedToId'));
    const data = await getFieldServiceMobileFlow(prisma, { tenantId, assignedToId });
    return c.json({ data });
  },

  async checkpoint(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const serviceRequestId = requireParam(c, 'id');
    const body = await c.req.json<{
      kind?: unknown;
      note?: unknown;
      customerName?: unknown;
    }>();

    try {
      const data = await createFieldServiceCheckpoint(prisma, {
        tenantId,
        serviceRequestId,
        kind: parseCheckpointKind(body.kind),
        note: optionalString(body.note),
        customerName: optionalString(body.customerName),
      });
      return c.json({ data }, 201);
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      if (error instanceof Error && error.message === 'SERVICE_REQUEST_NOT_FOUND') {
        return c.json(new NotFoundError('Servis Talebi', serviceRequestId).toJSON(), 404);
      }
      throw error;
    }
  },
};
