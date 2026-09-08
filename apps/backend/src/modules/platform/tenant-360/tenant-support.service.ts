import { AuditAction, EntityType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { NotFoundError } from '../../../errors/index.js';

export const supportNoteSchema = z.object({ body: z.string().trim().min(10).max(4000), ticketId: z.string().trim().max(120).optional() }).strict();

export async function addTenantSupportNote(tenantId: string, adminId: string, input: z.infer<typeof supportNoteSchema>): Promise<void> {
  await prisma.$transaction(async tx => {
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { id: true } });
    if (!tenant) throw new NotFoundError('Tenant bulunamadı');
    const note = await tx.tenantSupportNote.create({ data: { tenantId, authorId: adminId, body: input.body, ticketId: input.ticketId || null } });
    await tx.auditLog.create({ data: { tenantId, adminId, module: 'ADMIN_SUPPORT', entityType: EntityType.OTHER, entityId: note.id, action: AuditAction.CREATE, reason: 'Destek notu eklendi', ticketId: input.ticketId || null } });
  });
}
