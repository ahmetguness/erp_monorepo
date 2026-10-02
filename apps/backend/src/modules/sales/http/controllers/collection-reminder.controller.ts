import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { createCollectionReminderBodySchema,updateCollectionReminderStatusBodySchema } from '../../../../schemas/request-body.schemas.js';
import type { UpdateCollectionReminderStatusBody } from '../../../../schemas/request-body.schemas.js';
import { CollectionAutomationService } from '../../../../services/collection-automation.service.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';

export const CollectionReminderController = {
  async runAutomation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const result = await new CollectionAutomationService(prisma).run(tenantId, userId);
    return c.json({ data: result });
  },

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

    const invoice = await prisma.invoice.findFirst({
      where: { id: body.invoiceId, tenantId, deletedAt: null },
      select: { contactId: true, dueDate: true, totalGross: true, payments: { select: { amount: true } } },
    });
    if (!invoice) throw new NotFoundError('Fatura', body.invoiceId);
    if (invoice.contactId !== body.contactId) throw new ValidationError('Fatura ve cari birbiriyle uyumlu değildir.');
    if (!invoice.dueDate) throw new ValidationError('Faturanın vade tarihi bulunmalıdır.');
    const requestedDueDate = new Date(body.dueDate).toISOString().slice(0, 10);
    const invoiceDueDate = invoice.dueDate.toISOString().slice(0, 10);
    if (requestedDueDate !== invoiceDueDate) throw new ValidationError('Vade tarihi faturayla uyumlu değildir.');
    const paid = invoice.payments.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const outstanding = Math.max(0, Number(invoice.totalGross) - paid);
    if (body.amount > outstanding) throw new ValidationError('Hatırlatma tutarı faturanın kalan tutarını aşamaz.');

    const reminder = await prisma.collectionReminder.create({
      data: {
        tenantId,
        contactId: body.contactId,
        invoiceId: body.invoiceId || null,
        amount: body.amount,
        dueDate: invoice.dueDate,
        remindAt: new Date(body.remindAt),
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
    const body = getValidatedBody<UpdateCollectionReminderStatusBody>(c, updateCollectionReminderStatusBodySchema);

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
