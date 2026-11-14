import { db } from './database.js';
import { create } from './http.js';
import type { TenantFixture } from './fixtures.js';

export async function securityResources(tenant: TenantFixture) {
  const tenantId = tenant.tenant.id;
  const employee = await db.employee.create({ data: { tenantId, firstName: 'Private', lastName: tenantId, hireDate: new Date('2026-01-01'), salary: 100 } });
  const payroll = await db.payroll.create({ data: { tenantId, employeeId: employee.id, period: '2026-11', grossSalary: 100, netSalary: 80 } });
  const invoiceId = await create('/api/invoices', tenant.identity, { contactId: tenant.contact.id, type: 'SALES', date: '2026-11-01',
    lines: [{ description: 'Tenant-private invoice', quantity: 1, unitPrice: 100 }] });
  const paymentId = await create('/api/payments', tenant.identity, { contactId: tenant.contact.id, cashAccountId: tenant.cash.id, amount: 10, method: 'CASH', date: '2026-11-01' });
  const attachment = await db.attachment.create({ data: { tenantId, entityType: 'CONTACT', entityId: tenant.contact.id, fileName: `private-${tenantId}.txt`, storagePath: `${tenantId}/private-object`, mimeType: 'text/plain', fileSize: 10 } });
  const conversation = await db.chatConversation.create({ data: { tenantId, type: 'GROUP', title: `Private ${tenantId}`, createdById: tenant.owner.id,
    members: { create: { tenantId, userId: tenant.owner.id, role: 'OWNER' } } } });
  const chatAttachment = await db.chatAttachment.create({ data: { tenantId, uploaderId: tenant.owner.id, storageKey: `${tenantId}/chat/private-file`,
    originalName: 'private.txt', safeDisplayName: 'private.txt', mimeType: 'text/plain', sizeBytes: 10, kind: 'DOCUMENT', status: 'READY' } });
  return { employee, payroll, invoiceId, paymentId, attachment, conversation, chatAttachment };
}
