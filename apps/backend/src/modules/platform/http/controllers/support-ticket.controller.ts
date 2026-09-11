import type { Context } from 'hono';
import { requireParam } from '../../../../utils/context.js';
import {
  createTenantTicket,
  listTenantTickets,
  getTenantTicket,
  addTenantTicketMessage,
  closeTenantTicket,
  reopenTenantTicket,
} from '../../support-tickets/support-ticket.service.js';
import {
  createSupportTicketSchema,
  addTicketMessageSchema,
  listTenantTicketsQuerySchema,
} from '../../support-tickets/support-ticket.schemas.js';

export const SupportTicketController = {
  async list(c: Context): Promise<Response> {
    const tenantId: string = c.get('tenantId');
    const query = listTenantTicketsQuerySchema.safeParse(c.req.query());
    const filter = query.success ? query.data : undefined;
    const tickets = await listTenantTickets(tenantId, filter);
    return c.json({ data: tickets });
  },

  async create(c: Context): Promise<Response> {
    const tenantId: string = c.get('tenantId');
    const userId: string = c.get('userId');
    const body = await c.req.json<unknown>().catch(() => null);
    const parsed = createSupportTicketSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Geçersiz destek bileti bilgileri.' }, 400);
    }
    const ticket = await createTenantTicket(tenantId, userId, parsed.data);
    return c.json({ data: ticket }, 201);
  },

  async get(c: Context): Promise<Response> {
    const tenantId: string = c.get('tenantId');
    const id = requireParam(c, 'id');
    const ticket = await getTenantTicket(tenantId, id);
    return c.json({ data: ticket });
  },

  async addMessage(c: Context): Promise<Response> {
    const tenantId: string = c.get('tenantId');
    const userId: string = c.get('userId');
    const id = requireParam(c, 'id');
    const body = await c.req.json<unknown>().catch(() => null);
    const parsed = addTicketMessageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Geçersiz mesaj içeriği.' }, 400);
    }
    const message = await addTenantTicketMessage(tenantId, id, userId, parsed.data);
    return c.json({ data: message }, 201);
  },

  async close(c: Context): Promise<Response> {
    const tenantId: string = c.get('tenantId');
    const userId: string = c.get('userId');
    const id = requireParam(c, 'id');
    await closeTenantTicket(tenantId, id, userId);
    return c.json({ data: { success: true } });
  },

  async reopen(c: Context): Promise<Response> {
    const tenantId: string = c.get('tenantId');
    const userId: string = c.get('userId');
    const id = requireParam(c, 'id');
    const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
    const ticket = await reopenTenantTicket(tenantId, id, userId, body.reason);
    return c.json({ data: ticket });
  },
};
