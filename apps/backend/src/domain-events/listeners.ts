import { EntityType, NotificationStatus, Priority, TaskType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createTask } from '../services/task.service.js';
import { domainEvents } from './bus.js';
import { entityIdForEvent, entityTypeForEvent, type DomainEvent } from './events.js';

let listenersRegistered = false;

async function tenantRecipients(tenantId: string, preferredUserId?: string | null): Promise<string[]> {
  if (preferredUserId) {
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, userId: preferredUserId, isActive: true, user: { isActive: true } },
      select: { userId: true },
    });
    if (tenantUser) return [tenantUser.userId];
  }

  const owners = await prisma.tenantUser.findMany({
    where: { tenantId, isActive: true, isOwner: true, user: { isActive: true } },
    select: { userId: true },
    take: 10,
  });

  return owners.map((owner) => owner.userId);
}

async function notifyUsers(event: DomainEvent, title: string, message: string, module: string, preferredUserId?: string | null): Promise<void> {
  const userIds = await tenantRecipients(event.context.tenantId, preferredUserId);
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      tenantId: event.context.tenantId,
      userId,
      title,
      message,
      module,
      entityType: entityTypeForEvent(event),
      entityId: entityIdForEvent(event),
      status: NotificationStatus.UNREAD,
    })),
  });
}

async function notificationListener(event: DomainEvent): Promise<void> {
  switch (event.name) {
    case 'mail.failed':
      await notifyUsers(
        event,
        'Mail gönderimi başarısız oldu',
        `${event.payload.subject}: ${event.payload.error ?? 'Sağlayıcı hata döndürdü.'}`,
        'mail',
        event.payload.sentById ?? event.context.userId,
      );
      return;
    case 'stock.low':
      await notifyUsers(
        event,
        'Kritik stok seviyesi',
        `${event.payload.productCode} - ${event.payload.productName}: ${event.payload.currentQuantity}/${event.payload.minStockLevel}`,
        'inventory',
      );
      return;
    case 'invoice.overdue':
      await notifyUsers(
        event,
        'Fatura gecikmeye düştü',
        `${event.payload.number} ${event.payload.daysLate} gün gecikti. Tutar: ${event.payload.totalGross.toFixed(2)} TL`,
        'invoicing',
      );
      return;
    case 'employee.documentMissing':
      await notifyUsers(
        event,
        'Personel evrakı eksik',
        `${event.payload.employeeName}: ${event.payload.documentName}`,
        'hr',
      );
      return;
    case 'invoice.created':
    case 'payment.received':
    case 'salesQuote.accepted':
      return;
  }
}

async function workflowListener(event: DomainEvent): Promise<void> {
  switch (event.name) {
    case 'stock.low':
      await createTask(event.context.tenantId, {
        title: `Kritik stok: ${event.payload.productCode}`,
        detail: `${event.payload.productName} stok seviyesi ${event.payload.currentQuantity}. Minimum: ${event.payload.minStockLevel}.`,
        type: TaskType.CHECK,
        priority: Priority.HIGH,
        module: 'inventory',
        entityType: EntityType.PRODUCT,
        entityId: event.payload.productId,
        href: `/dashboard/products/${event.payload.productId}`,
        source: `domain:stock.low:${event.payload.productId}`,
        createdById: event.context.userId ?? null,
      });
      return;
    case 'invoice.overdue':
      await createTask(event.context.tenantId, {
        title: `Geciken fatura: ${event.payload.number}`,
        detail: `${event.payload.contactName} için ${event.payload.totalGross.toFixed(2)} TL tutarında fatura ${event.payload.daysLate} gün gecikti.`,
        type: TaskType.COLLECTION,
        priority: event.payload.daysLate > 30 ? Priority.CRITICAL : Priority.HIGH,
        module: 'invoicing',
        entityType: EntityType.INVOICE,
        entityId: event.payload.invoiceId,
        href: `/dashboard/invoices/${event.payload.invoiceId}`,
        source: `domain:invoice.overdue:${event.payload.invoiceId}`,
        createdById: event.context.userId ?? null,
        dueAt: event.payload.dueDate,
      });
      return;
    case 'employee.documentMissing':
      await createTask(event.context.tenantId, {
        title: `Eksik evrak: ${event.payload.employeeName}`,
        detail: event.payload.documentName,
        type: TaskType.CHECK,
        priority: event.payload.severity,
        module: 'hr',
        entityType: EntityType.EMPLOYEE,
        entityId: event.payload.employeeId,
        href: `/dashboard/hr/employees/${event.payload.employeeId}`,
        source: `domain:employee.documentMissing:${event.payload.employeeId}:${event.payload.documentName}`,
        createdById: event.context.userId ?? null,
      });
      return;
    case 'invoice.created':
    case 'payment.received':
    case 'salesQuote.accepted':
    case 'mail.failed':
      return;
  }
}

export function registerDomainEventListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;
  domainEvents.subscribe(notificationListener);
  domainEvents.subscribe(workflowListener);
}
