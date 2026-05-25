import { AuditAction, EntityType, NotificationStatus, Prisma, Priority, TaskType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createTask } from '../services/task.service.js';
import { createAuditLog } from '../utils/audit.js';
import { domainEvents } from './bus.js';
import { entityIdForEvent, entityTypeForEvent, sourceForEvent, type DomainEvent } from './events.js';

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

function moduleForEvent(event: DomainEvent): string {
  switch (event.name) {
    case 'invoice.created':
    case 'invoice.overdue':
      return 'invoicing';
    case 'payment.received':
      return 'accounting';
    case 'stock.low':
      return 'inventory';
    case 'salesQuote.accepted':
      return 'sales';
    case 'mail.failed':
      return 'mail';
    case 'employee.documentMissing':
      return 'hr';
    case 'production.materialReserved':
    case 'production.completed':
      return 'production';
  }
}

function auditPayload(event: DomainEvent): Prisma.InputJsonObject {
  switch (event.name) {
    case 'invoice.created':
      return {
        event: event.name,
        invoiceId: event.payload.invoiceId,
        number: event.payload.number,
        contactId: event.payload.contactId,
        contactName: event.payload.contactName,
        totalGross: event.payload.totalGross,
        dueDate: event.payload.dueDate?.toISOString() ?? null,
      };
    case 'invoice.overdue':
      return {
        event: event.name,
        invoiceId: event.payload.invoiceId,
        number: event.payload.number,
        contactId: event.payload.contactId,
        contactName: event.payload.contactName,
        totalGross: event.payload.totalGross,
        dueDate: event.payload.dueDate.toISOString(),
        daysLate: event.payload.daysLate,
      };
    case 'payment.received':
      return {
        event: event.name,
        paymentId: event.payload.paymentId,
        contactId: event.payload.contactId,
        amount: event.payload.amount,
        method: event.payload.method,
        reference: event.payload.reference,
      };
    case 'stock.low':
      return {
        event: event.name,
        productId: event.payload.productId,
        productCode: event.payload.productCode,
        productName: event.payload.productName,
        currentQuantity: event.payload.currentQuantity,
        minStockLevel: event.payload.minStockLevel,
        warehouseId: event.payload.warehouseId,
      };
    case 'salesQuote.accepted':
      return {
        event: event.name,
        quoteId: event.payload.quoteId,
        orderId: event.payload.orderId,
        quoteNumber: event.payload.quoteNumber,
        orderNumber: event.payload.orderNumber,
        contactId: event.payload.contactId,
        totalGross: event.payload.totalGross,
      };
    case 'mail.failed':
      return {
        event: event.name,
        mailId: event.payload.mailId,
        subject: event.payload.subject,
        sentById: event.payload.sentById,
        recipients: event.payload.recipients,
        error: event.payload.error,
      };
    case 'employee.documentMissing':
      return {
        event: event.name,
        employeeId: event.payload.employeeId,
        employeeName: event.payload.employeeName,
        documentName: event.payload.documentName,
        severity: event.payload.severity,
      };
    case 'production.materialReserved':
      return {
        event: event.name,
        workOrderId: event.payload.workOrderId,
        workOrderNumber: event.payload.workOrderNumber,
        reservedLineCount: event.payload.reservedLineCount,
        reservedQuantity: event.payload.reservedQuantity,
      };
    case 'production.completed':
      return {
        event: event.name,
        workOrderId: event.payload.workOrderId,
        workOrderNumber: event.payload.workOrderNumber,
        productId: event.payload.productId,
        productName: event.payload.productName,
        plannedQty: event.payload.plannedQty,
        producedQty: event.payload.producedQty,
        scrapQty: event.payload.scrapQty,
      };
  }
}

async function auditListener(event: DomainEvent): Promise<void> {
  if (event.name === 'invoice.created' || event.name === 'payment.received') return;

  await createAuditLog(prisma, {
    tenantId: event.context.tenantId,
    userId: event.context.userId ?? null,
    module: moduleForEvent(event),
    entityType: entityTypeForEvent(event),
    entityId: entityIdForEvent(event),
    action: event.name === 'salesQuote.accepted' || event.name === 'production.completed' ? AuditAction.UPDATE : AuditAction.CREATE,
    newValues: auditPayload(event),
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
    case 'production.materialReserved':
      await notifyUsers(
        event,
        'Uretim malzemesi rezerve edildi',
        `${event.payload.workOrderNumber} icin ${event.payload.reservedLineCount} kalemde ${event.payload.reservedQuantity.toFixed(3)} birim rezerve edildi.`,
        'production',
      );
      return;
    case 'production.completed':
      await notifyUsers(
        event,
        'Uretim tamamlandi',
        `${event.payload.workOrderNumber}: ${event.payload.productName} icin ${event.payload.producedQty.toFixed(3)} birim uretildi${event.payload.scrapQty > 0 ? `, ${event.payload.scrapQty.toFixed(3)} fire kaydedildi` : ''}.`,
        'production',
      );
      return;
    case 'payment.received':
      await notifyUsers(
        event,
        'Tahsilat alindi',
        `${event.payload.amount.toFixed(2)} TL tahsilat kaydedildi${event.payload.reference ? ` (${event.payload.reference})` : ''}.`,
        'accounting',
      );
      return;
    case 'salesQuote.accepted':
      await notifyUsers(
        event,
        'Teklif siparise donustu',
        `${event.payload.quoteNumber} kabul edildi ve ${event.payload.orderNumber} siparisi olustu. Tutar: ${event.payload.totalGross.toFixed(2)} TL`,
        'sales',
      );
      return;
    case 'invoice.created':
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
        source: sourceForEvent(event),
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
        source: sourceForEvent(event),
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
        source: sourceForEvent(event),
        createdById: event.context.userId ?? null,
      });
      return;
    case 'salesQuote.accepted':
      await createTask(event.context.tenantId, {
        title: `Siparis takibi: ${event.payload.orderNumber}`,
        detail: `${event.payload.quoteNumber} teklifinden olusan siparis icin sevkiyat/faturalama takibini baslatin.`,
        type: TaskType.GENERAL,
        priority: Priority.MEDIUM,
        module: 'sales',
        entityType: EntityType.SALES_ORDER,
        entityId: event.payload.orderId,
        href: `/dashboard/sales-orders/${event.payload.orderId}`,
        source: sourceForEvent(event),
        createdById: event.context.userId ?? null,
      });
      return;
    case 'production.completed':
      await createTask(event.context.tenantId, {
        title: `Uretim kapanis kontrolu: ${event.payload.workOrderNumber}`,
        detail: `${event.payload.productName} uretimi tamamlandi. Stok girisi, maliyet ve fire kayitlarini kontrol edin.`,
        type: TaskType.CHECK,
        priority: event.payload.scrapQty > 0 ? Priority.HIGH : Priority.MEDIUM,
        module: 'production',
        entityType: EntityType.WORK_ORDER,
        entityId: event.payload.workOrderId,
        href: `/dashboard/production/work-orders/${event.payload.workOrderId}`,
        source: sourceForEvent(event),
        createdById: event.context.userId ?? null,
      });
      return;
    case 'invoice.created':
    case 'payment.received':
    case 'mail.failed':
    case 'production.materialReserved':
      return;
  }
}

export function registerDomainEventListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;
  domainEvents.subscribe(auditListener);
  domainEvents.subscribe(notificationListener);
  domainEvents.subscribe(workflowListener);
}
