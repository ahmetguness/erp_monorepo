import type { Context } from 'hono';
import { requireParam } from '../../../../../utils/context.js';
import {
  listAdminTickets,
  getAdminTicket,
  addAdminTicketMessage,
  updateAdminTicket,
} from '../../../support-tickets/support-ticket.service.js';
import {
  addTicketMessageSchema,
  updateTicketAdminSchema,
  listAdminTicketsQuerySchema,
} from '../../../support-tickets/support-ticket.schemas.js';

export const AdminSupportTicketController = {
  async list(c: Context): Promise<Response> {
    const query = listAdminTicketsQuerySchema.safeParse(c.req.query());
    const filter = query.success ? query.data : undefined;
    const tickets = await listAdminTickets(filter);
    return c.json({ data: tickets });
  },

  async get(c: Context): Promise<Response> {
    const id = requireParam(c, 'id');
    const ticket = await getAdminTicket(id);
    return c.json({ data: ticket });
  },

  async addMessage(c: Context): Promise<Response> {
    const adminId: string = c.get('adminId');
    const id = requireParam(c, 'id');
    const body = await c.req.json<unknown>().catch(() => null);
    const parsed = addTicketMessageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Geçersiz mesaj içeriği.' }, 400);
    }
    const message = await addAdminTicketMessage(adminId, id, parsed.data);
    return c.json({ data: message }, 201);
  },

  async update(c: Context): Promise<Response> {
    const adminId: string = c.get('adminId');
    const id = requireParam(c, 'id');
    const body = await c.req.json<unknown>().catch(() => null);
    const parsed = updateTicketAdminSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Geçersiz güncelleme bilgisi.' }, 400);
    }
    const ticket = await updateAdminTicket(adminId, id, parsed.data);
    return c.json({ data: ticket });
  },
};
