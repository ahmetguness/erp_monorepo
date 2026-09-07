import { AdminChangeRequestStatus } from '@prisma/client';
import { ADMIN_CHANGE_REQUEST_STATUSES, type AdminPermission } from '@repo/types';
import type { Context } from 'hono';
import { ZodError } from 'zod';
import {
  AdminChangeRequestError, approveAdminChange, listAdminChanges, rejectAdminChange, rollbackAdminChange,
} from '../../../admin-change-request/admin-change-request.service.js';
import { changeMetadataSchema, decisionSchema, previewRequestSchema } from '../../../admin-change-request/admin-change-request.schemas.js';
import { previewAdminChange } from '../../../admin-change-request/admin-change-preview.service.js';
import { requireParam } from '../../../../../utils/context.js';
import { getRequestMeta } from '../../../../../utils/audit.js';

function adminContext(c: Context): { adminId: string; permissions: AdminPermission[] } {
  return {
    adminId: c.get('adminId') as string,
    permissions: c.get('adminPermissions') as AdminPermission[],
  };
}

function handleError(c: Context, error: unknown): Response {
  if (error instanceof AdminChangeRequestError) return c.json(
    { error: error.message, code: 'CHANGE_REQUEST_ERROR' },
    error.statusCode as 400 | 403 | 404 | 409,
  );
  if (error instanceof ZodError) return c.json({ error: 'Geçersiz karar verisi.', code: 'VALIDATION_ERROR' }, 400);
  throw error;
}

export const AdminChangeRequestController = {
  async preview(c: Context): Promise<Response> {
    try {
      const input = previewRequestSchema.parse(await c.req.json<unknown>());
      return c.json({ data: await previewAdminChange(input) });
    } catch (error) { return handleError(c, error); }
  },

  async list(c: Context): Promise<Response> {
    const statusQuery = c.req.query('status');
    const status = statusQuery && (ADMIN_CHANGE_REQUEST_STATUSES as readonly string[]).includes(statusQuery)
      ? statusQuery as AdminChangeRequestStatus
      : undefined;
    if (statusQuery && !status) return c.json({ error: 'Geçersiz talep durumu.' }, 400);
    return c.json({ data: await listAdminChanges(status) });
  },

  async approve(c: Context): Promise<Response> {
    try {
      const body = decisionSchema.parse(await c.req.json<unknown>().catch(() => ({})));
      const { adminId, permissions } = adminContext(c);
      return c.json({
        data: await approveAdminChange(
          requireParam(c, 'id'), adminId, permissions, body.note, getRequestMeta(c).requestId,
        ),
      });
    } catch (error) { return handleError(c, error); }
  },

  async reject(c: Context): Promise<Response> {
    try {
      const body = decisionSchema.parse(await c.req.json<unknown>().catch(() => ({})));
      const { adminId, permissions } = adminContext(c);
      return c.json({ data: await rejectAdminChange(requireParam(c, 'id'), adminId, permissions, body.note) });
    } catch (error) { return handleError(c, error); }
  },

  async rollback(c: Context): Promise<Response> {
    try {
      const body = changeMetadataSchema.parse(await c.req.json<unknown>());
      const { adminId, permissions } = adminContext(c);
      return c.json({
        data: await rollbackAdminChange(
          requireParam(c, 'id'), adminId, permissions, body.reason, body.ticketId, getRequestMeta(c).requestId,
        ),
      });
    } catch (error) { return handleError(c, error); }
  },
};
