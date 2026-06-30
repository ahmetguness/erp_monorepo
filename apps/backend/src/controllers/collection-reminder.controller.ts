import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../errors';
import { requireTenantId, requireParam } from '../utils/context.js';
import { getValidatedBody } from '../middleware/validateBody';
import { createCollectionReminderBodySchema } from '../schemas/request-body.schemas';

export const CollectionReminderController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const reminders = await prisma.collectionReminder.findMany({
      where: { tenantId },
      include: {
        contact: { select: { id: true, name: true, phone: true, email: true } },
        invoice: { select: { id: true, number: true, totalGross: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    return c.json({ data: reminders });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody(c, createCollectionReminderBodySchema);

    const reminder = await prisma.collectionReminder.create({
      data: {
        tenantId,
        contactId: body.contactId,
        invoiceId: body.invoiceId || null,
        amount: body.amount,
        dueDate: new Date(body.dueDate),
        notes: body.notes || null,
        status: 'PENDING',
      },
      include: {
        contact: { select: { id: true, name: true } },
        invoice: { select: { id: true, number: true } },
      },
    });

    return c.json({ data: reminder }, 201);
  },

  async updateStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const body = await c.req.json<{ status: string; notes?: string }>();

    const existing = await prisma.collectionReminder.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundError('Tahsilat Hatırlatıcısı', id);
    }

    const updated = await prisma.collectionReminder.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.collectionReminder.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundError('Tahsilat Hatırlatıcısı', id);
    }

    await prisma.collectionReminder.delete({
      where: { id },
    });

    return c.json({ success: true });
  },
};
