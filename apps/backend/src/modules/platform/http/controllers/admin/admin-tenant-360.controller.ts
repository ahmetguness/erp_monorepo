import type { Context } from 'hono';
import type { AdminPermission } from '@repo/types';
import { requireParam } from '../../../../../utils/context.js';
import { getTenant360 } from '../../../tenant-360/tenant-360.service.js';
import { addTenantSupportNote, supportNoteSchema } from '../../../tenant-360/tenant-support.service.js';

export const AdminTenant360Controller = {
  async get(c: Context): Promise<Response> {
    const permissions: AdminPermission[] = c.get('adminPermissions') ?? [];
    return c.json({ data: await getTenant360(requireParam(c, 'id'), permissions) });
  },
  async addNote(c: Context): Promise<Response> {
    const input = supportNoteSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!input.success) return c.json({ error: 'Not 10–4000, talep numarası en fazla 120 karakter olmalıdır.' }, 400);
    await addTenantSupportNote(requireParam(c, 'id'), c.get('adminId'), input.data);
    return c.json({ data: { success: true } }, 201);
  },
};
