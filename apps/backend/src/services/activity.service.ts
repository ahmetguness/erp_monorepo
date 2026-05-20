import { AuditAction, EntityType, MailDeliveryStatus, MailDirection, Prisma, ServiceActivityType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { formatAuditLogBusiness } from './audit-log-formatter.service';

export type ActivitySource = 'AUDIT' | 'ATTACHMENT' | 'MAIL' | 'TASK' | 'NOTIFICATION' | 'APPROVAL' | 'PAYMENT' | 'SERVICE';
export type ActivityTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export interface ActivityItem {
  id: string;
  source: ActivitySource;
  tone: ActivityTone;
  title: string;
  description: string | null;
  actorLabel: string | null;
  module: string | null;
  entityType: EntityType;
  entityId: string;
  occurredAt: string;
  href: string | null;
}

export interface ActivityListInput {
  tenantId: string;
  userId: string;
  entityType: EntityType;
  entityId: string;
  limit: number;
}

interface InternalActivityItem extends Omit<ActivityItem, 'occurredAt'> {
  occurredAt: Date;
  actorId: string | null;
  auditFormat?: {
    action: AuditAction;
    oldValues: Prisma.JsonValue | null;
    newValues: Prisma.JsonValue | null;
  };
}

const ACTION_TITLES: Record<AuditAction, string> = {
  CREATE: 'Kayıt oluşturuldu',
  UPDATE: 'Kayıt güncellendi',
  DELETE: 'Kayıt silindi',
  APPROVE: 'Kayıt onaylandı',
  REJECT: 'Kayıt reddedildi',
  EXPORT: 'Kayıt dışa aktarıldı',
  LOGIN: 'Giriş yapıldı',
  LOGOUT: 'Çıkış yapıldı',
  OTHER: 'İşlem yapıldı',
};

const ACTION_TONES: Record<AuditAction, ActivityTone> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  APPROVE: 'success',
  REJECT: 'danger',
  EXPORT: 'warning',
  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  OTHER: 'neutral',
};

const SERVICE_ACTIVITY_TITLES: Record<ServiceActivityType, string> = {
  NOTE: 'Servis notu eklendi',
  STATUS_CHANGE: 'Servis durumu değişti',
  ASSIGNMENT: 'Servis ataması yapıldı',
  CALL: 'Müşteri arandı',
  VISIT: 'Servis ziyareti kaydedildi',
  OTHER: 'Servis aktivitesi eklendi',
};

function isRecord(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatJsonValue(value: Prisma.JsonValue | undefined): string {
  if (value === undefined || value === null) return 'boş';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} öğe`;
  return 'detay';
}

function formatAuditDescription(oldValues: Prisma.JsonValue | null, newValues: Prisma.JsonValue | null): string | null {
  const oldRecord = isRecord(oldValues) ? oldValues : {};
  const newRecord = isRecord(newValues) ? newValues : {};
  const fields = Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]))
    .filter((field) => field !== 'id')
    .slice(0, 3);

  if (fields.length === 0) return null;

  return fields
    .map((field) => {
      const oldValue = oldRecord[field];
      const newValue = newRecord[field];
      if (oldValue !== undefined && newValue !== undefined) {
        return `${field}: ${formatJsonValue(oldValue)} → ${formatJsonValue(newValue)}`;
      }
      if (newValue !== undefined) return `${field}: ${formatJsonValue(newValue)}`;
      return `${field}: ${formatJsonValue(oldValue)}`;
    })
    .join(', ');
}

function mailStatusTitle(status: MailDeliveryStatus): string {
  if (status === MailDeliveryStatus.SENT) return 'Mail gönderildi';
  if (status === MailDeliveryStatus.FAILED) return 'Mail gönderimi başarısız oldu';
  return 'Mail taslağı kaydedildi';
}

function mailTone(status: MailDeliveryStatus): ActivityTone {
  if (status === MailDeliveryStatus.SENT) return 'success';
  if (status === MailDeliveryStatus.FAILED) return 'danger';
  return 'warning';
}

function paymentDescription(amount: Prisma.Decimal, method: string, reference: string | null): string {
  const base = `${amount.toFixed(2)} TL, yöntem: ${method}`;
  return reference ? `${base}, referans: ${reference}` : base;
}

async function getTenantUserEmail(db: PrismaClient, tenantId: string, userId: string): Promise<string | null> {
  const tenantUser = await db.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true, user: { isActive: true } },
    select: { user: { select: { email: true } } },
  });
  return tenantUser?.user.email ?? null;
}

async function getEntityEmail(db: PrismaClient, tenantId: string, entityType: EntityType, entityId: string): Promise<string | null> {
  if (entityType === EntityType.CONTACT) {
    const contact = await db.contact.findFirst({ where: { tenantId, id: entityId }, select: { email: true } });
    return contact?.email ?? null;
  }
  if (entityType === EntityType.EMPLOYEE) {
    const employee = await db.employee.findFirst({ where: { tenantId, id: entityId }, select: { email: true } });
    return employee?.email ?? null;
  }
  return null;
}

function visibleMailWhere(userId: string, userEmail: string): Prisma.MailMessageWhereInput {
  return {
    OR: [
      { sentById: userId },
      { to: { has: userEmail } },
      { cc: { has: userEmail } },
      { bcc: { has: userEmail } },
    ],
  };
}

function collectActorIds(items: InternalActivityItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.actorId).filter((id): id is string => Boolean(id))));
}

async function resolveActorLabels(db: PrismaClient, actorIds: string[]): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((user) => [user.id, `${user.name} (${user.email})`]));
}

export class ActivityService {
  constructor(private readonly db: PrismaClient) {}

  async list(input: ActivityListInput): Promise<{ data: ActivityItem[]; meta: { total: number; limit: number } }> {
    const [auditItems, attachmentItems, taskItems, notificationItems, approvalItems, paymentItems, serviceItems, mailItems] = await Promise.all([
      this.listAudit(input),
      this.listAttachments(input),
      this.listTasks(input),
      this.listNotifications(input),
      this.listApprovals(input),
      this.listPayments(input),
      this.listServiceActivities(input),
      this.listMails(input),
    ]);

    const merged = [
      ...auditItems,
      ...attachmentItems,
      ...taskItems,
      ...notificationItems,
      ...approvalItems,
      ...paymentItems,
      ...serviceItems,
      ...mailItems,
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const actorLabels = await resolveActorLabels(this.db, collectActorIds(merged));
    const data = merged.slice(0, input.limit).map((item): ActivityItem => ({
      id: item.id,
      source: item.source,
      tone: item.tone,
      title: item.actorId ? `${actorLabels.get(item.actorId) ?? 'Bir kullanıcı'} ${item.title.toLowerCase()}` : item.title,
      description: item.description,
      actorLabel: item.actorId ? actorLabels.get(item.actorId) ?? null : item.actorLabel,
      module: item.module,
      entityType: item.entityType,
      entityId: item.entityId,
      occurredAt: item.occurredAt.toISOString(),
      href: item.href,
    }));

    return { data, meta: { total: merged.length, limit: input.limit } };
  }

  private async listAudit(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const logs = await this.db.auditLog.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        NOT: [{ module: 'attachments', action: AuditAction.CREATE }],
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return logs.map((log): InternalActivityItem => ({
      id: `audit:${log.id}`,
      source: 'AUDIT',
      tone: ACTION_TONES[log.action],
      title: formatAuditLogBusiness({
        action: log.action,
        module: log.module,
        entityType: log.entityType,
        entityLabel: null,
        userLabel: null,
        oldValues: log.oldValues,
        newValues: log.newValues,
      }).summary.replace(/^Sistem /, ''),
      description: formatAuditLogBusiness({
        action: log.action,
        module: log.module,
        entityType: log.entityType,
        entityLabel: null,
        userLabel: null,
        oldValues: log.oldValues,
        newValues: log.newValues,
      }).changes.slice(0, 3).map((change) => `${change.label}: ${change.oldValue ?? 'boş'} -> ${change.newValue ?? 'boş'}`).join(', ') || null,
      actorLabel: null,
      actorId: log.userId,
      module: log.module,
      entityType: log.entityType,
      entityId: log.entityId,
      occurredAt: log.createdAt,
      href: null,
      auditFormat: {
        action: log.action,
        oldValues: log.oldValues,
        newValues: log.newValues,
      },
    }));
  }

  private async listAttachments(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const attachments = await this.db.attachment.findMany({
      where: { tenantId: input.tenantId, entityType: input.entityType, entityId: input.entityId },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return attachments.map((attachment): InternalActivityItem => ({
      id: `attachment:${attachment.id}`,
      source: 'ATTACHMENT',
      tone: 'info',
      title: 'dosya ekledi',
      description: attachment.fileName,
      actorLabel: null,
      actorId: attachment.uploadedById,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      occurredAt: attachment.createdAt,
      href: `/api/attachments/${attachment.id}/download`,
    }));
  }

  private async listTasks(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const tasks = await this.db.task.findMany({
      where: { tenantId: input.tenantId, entityType: input.entityType, entityId: input.entityId },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return tasks.map((task): InternalActivityItem => ({
      id: `task:${task.id}`,
      source: 'TASK',
      tone: task.status === 'DONE' ? 'success' : 'warning',
      title: task.status === 'DONE' ? 'görevi tamamladı' : 'görev oluşturdu',
      description: task.detail ? `${task.title} - ${task.detail}` : task.title,
      actorLabel: null,
      actorId: task.createdById,
      module: task.module ?? 'tasks',
      entityType: task.entityType ?? input.entityType,
      entityId: task.entityId ?? input.entityId,
      occurredAt: task.createdAt,
      href: task.href,
    }));
  }

  private async listNotifications(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const notifications = await this.db.notification.findMany({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return notifications.map((notification): InternalActivityItem => ({
      id: `notification:${notification.id}`,
      source: 'NOTIFICATION',
      tone: notification.status === 'READ' ? 'neutral' : 'info',
      title: 'Bildirim oluşturuldu',
      description: notification.message ? `${notification.title} - ${notification.message}` : notification.title,
      actorLabel: null,
      actorId: null,
      module: notification.module,
      entityType: notification.entityType ?? input.entityType,
      entityId: notification.entityId ?? input.entityId,
      occurredAt: notification.createdAt,
      href: null,
    }));
  }

  private async listApprovals(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const requests = await this.db.approvalRequest.findMany({
      where: { tenantId: input.tenantId, entityType: input.entityType, entityId: input.entityId },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: {
        id: true,
        status: true,
        notes: true,
        requestedBy: true,
        createdAt: true,
        updatedAt: true,
        actions: {
          select: { id: true, actionType: true, actorId: true, notes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return requests.flatMap((request): InternalActivityItem[] => {
      const requestItem: InternalActivityItem = {
        id: `approval:${request.id}`,
        source: 'APPROVAL',
        tone: request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'warning',
        title: 'onay süreci başlattı',
        description: request.notes,
        actorLabel: null,
        actorId: request.requestedBy,
        module: 'approvals',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: request.createdAt,
        href: '/dashboard/approvals',
      };

      const actionItems = request.actions.map((action): InternalActivityItem => ({
        id: `approval-action:${action.id}`,
        source: 'APPROVAL',
        tone: action.actionType === 'APPROVE' ? 'success' : action.actionType === 'REJECT' ? 'danger' : 'info',
        title: `onay aksiyonu aldı: ${action.actionType}`,
        description: action.notes,
        actorLabel: null,
        actorId: action.actorId,
        module: 'approvals',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: action.createdAt,
        href: '/dashboard/approvals',
      }));

      return [requestItem, ...actionItems];
    });
  }

  private async listPayments(input: ActivityListInput): Promise<InternalActivityItem[]> {
    if (input.entityType === EntityType.INVOICE) {
      const allocations = await this.db.paymentAllocation.findMany({
        where: { tenantId: input.tenantId, invoiceId: input.entityId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
              reference: true,
              createdById: true,
            },
          },
        },
      });

      return allocations.map((allocation): InternalActivityItem => ({
        id: `payment-allocation:${allocation.id}`,
        source: 'PAYMENT',
        tone: 'success',
        title: 'faturaya ödeme bağladı',
        description: `${allocation.amount.toFixed(2)} TL tahsis edildi. ${paymentDescription(allocation.payment.amount, allocation.payment.method, allocation.payment.reference)}`,
        actorLabel: null,
        actorId: allocation.payment.createdById,
        module: 'payments',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: allocation.createdAt,
        href: `/dashboard/payments/${allocation.payment.id}`,
      }));
    }

    if (input.entityType === EntityType.CONTACT) {
      const payments = await this.db.payment.findMany({
        where: { tenantId: input.tenantId, contactId: input.entityId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });

      return payments.map((payment): InternalActivityItem => ({
        id: `payment:${payment.id}`,
        source: 'PAYMENT',
        tone: payment.status === 'COMPLETED' ? 'success' : 'warning',
        title: 'ödeme kaydetti',
        description: paymentDescription(payment.amount, payment.method, payment.reference),
        actorLabel: null,
        actorId: payment.createdById,
        module: 'payments',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: payment.createdAt,
        href: `/dashboard/payments/${payment.id}`,
      }));
    }

    return [];
  }

  private async listServiceActivities(input: ActivityListInput): Promise<InternalActivityItem[]> {
    if (input.entityType !== EntityType.SERVICE_REQUEST) return [];

    const [activities, histories] = await Promise.all([
      this.db.serviceActivity.findMany({
        where: { tenantId: input.tenantId, serviceRequestId: input.entityId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      }),
      this.db.serviceRequestHistory.findMany({
        where: { tenantId: input.tenantId, serviceRequestId: input.entityId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      }),
    ]);

    return [
      ...activities.map((activity): InternalActivityItem => ({
        id: `service-activity:${activity.id}`,
        source: 'SERVICE',
        tone: 'info',
        title: SERVICE_ACTIVITY_TITLES[activity.activityType],
        description: activity.notes,
        actorLabel: null,
        actorId: activity.actorId,
        module: 'service',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: activity.createdAt,
        href: `/dashboard/service/requests/${input.entityId}`,
      })),
      ...histories.map((history): InternalActivityItem => ({
        id: `service-history:${history.id}`,
        source: 'SERVICE',
        tone: 'info',
        title: 'servis durumunu değiştirdi',
        description: `${history.fromStatus ?? 'Başlangıç'} → ${history.toStatus}${history.notes ? ` - ${history.notes}` : ''}`,
        actorLabel: null,
        actorId: history.createdById,
        module: 'service',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: history.createdAt,
        href: `/dashboard/service/requests/${input.entityId}`,
      })),
    ];
  }

  private async listMails(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const [userEmail, entityEmail] = await Promise.all([
      getTenantUserEmail(this.db, input.tenantId, input.userId),
      getEntityEmail(this.db, input.tenantId, input.entityType, input.entityId),
    ]);
    if (!userEmail || !entityEmail) return [];

    const where: Prisma.MailMessageWhereInput = {
      tenantId: input.tenantId,
      AND: [
        visibleMailWhere(input.userId, userEmail),
        {
          OR: [
            { to: { has: entityEmail } },
            { cc: { has: entityEmail } },
            { bcc: { has: entityEmail } },
            { from: { contains: entityEmail, mode: 'insensitive' } },
          ],
        },
      ],
    };

    const mails = await this.db.mailMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: {
        id: true,
        direction: true,
        status: true,
        subject: true,
        textPreview: true,
        attachmentCount: true,
        sentById: true,
        sentAt: true,
        createdAt: true,
      },
    });

    return mails.map((mail): InternalActivityItem => ({
      id: `mail:${mail.id}`,
      source: 'MAIL',
      tone: mailTone(mail.status),
      title: mail.direction === MailDirection.INBOUND ? 'Mail alındı' : mailStatusTitle(mail.status),
      description: `${mail.subject}${mail.attachmentCount > 0 ? ` (${mail.attachmentCount} ek)` : ''}${mail.textPreview ? ` - ${mail.textPreview}` : ''}`,
      actorLabel: null,
      actorId: mail.sentById,
      module: 'mail',
      entityType: input.entityType,
      entityId: input.entityId,
      occurredAt: mail.sentAt ?? mail.createdAt,
      href: `/dashboard/mail?mailId=${mail.id}`,
    }));
  }
}
