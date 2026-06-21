import {
  AuditAction,
  EntityType,
  MailDeliveryStatus,
  MailDirection,
  Prisma,
  ServiceActivityType,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { resolveAuditFieldValueLabels } from '../audit/field-label-resolver.js';
import { formatAuditLogBusiness } from '../audit/formatter.js';
import type {
  ActivityItem,
  ActivityImportance,
  ActivityListInput,
  ActivityListResult,
  ActivitySource,
  ActivityTone,
  InternalActivityItem,
} from './types.js';

// ─────────────────────────────────────────────
// ActivityService
// Entity bazlı timeline için tüm kaynaklardan
// aktivite kalemlerini toplayıp birleştirir.
// ─────────────────────────────────────────────

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

const ACTION_IMPORTANCE: Record<AuditAction, ActivityImportance> = {
  CREATE: 'medium',
  UPDATE: 'medium',
  DELETE: 'high',
  APPROVE: 'high',
  REJECT: 'high',
  EXPORT: 'low',
  LOGIN: 'low',
  LOGOUT: 'low',
  OTHER: 'low',
};

const SERVICE_ACTIVITY_LABELS: Record<ServiceActivityType, string> = {
  NOTE: 'Servis notu eklendi',
  STATUS_CHANGE: 'Servis durumu değişti',
  ASSIGNMENT: 'Servis ataması yapıldı',
  CALL: 'Müşteri arandı',
  VISIT: 'Servis ziyareti kaydedildi',
  OTHER: 'Servis aktivitesi eklendi',
};

const SERVICE_ACTIVITY_IMPORTANCE: Record<ServiceActivityType, ActivityImportance> = {
  NOTE: 'low',
  STATUS_CHANGE: 'high',
  ASSIGNMENT: 'medium',
  CALL: 'medium',
  VISIT: 'medium',
  OTHER: 'low',
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  APPROVE: 'onayladı',
  REJECT: 'reddetti',
  REQUEST_CHANGES: 'değişiklik istedi',
  COMMENT: 'yorum ekledi',
  DELEGATE: 'devredildi',
};

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

function mailImportance(status: MailDeliveryStatus): ActivityImportance {
  if (status === MailDeliveryStatus.FAILED) return 'high';
  if (status === MailDeliveryStatus.SENT) return 'medium';
  return 'low';
}

function paymentDescription(amount: Prisma.Decimal, method: string, reference: string | null): string {
  const formatted = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(amount.toNumber());
  const base = `${formatted}, yöntem: ${method}`;
  return reference ? `${base}, referans: ${reference}` : base;
}

function paymentHref(paymentId: string): string {
  return `/dashboard/payments?paymentId=${paymentId}`;
}

async function getTenantUserEmail(
  db: PrismaClient,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const tenantUser = await db.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true, user: { isActive: true } },
    select: { user: { select: { email: true } } },
  });
  return tenantUser?.user.email ?? null;
}

async function getEntityEmail(
  db: PrismaClient,
  tenantId: string,
  entityType: EntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === EntityType.CONTACT) {
    const contact = await db.contact.findFirst({
      where: { tenantId, id: entityId },
      select: { email: true },
    });
    return contact?.email ?? null;
  }
  if (entityType === EntityType.EMPLOYEE) {
    const employee = await db.employee.findFirst({
      where: { tenantId, id: entityId },
      select: { email: true },
    });
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
  return Array.from(
    new Set(items.map((item) => item.actorId).filter((id): id is string => Boolean(id))),
  );
}

async function resolveActorLabels(
  db: PrismaClient,
  actorIds: string[],
): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((user) => [user.id, `${user.name} (${user.email})`]));
}

export class ActivityService {
  constructor(private readonly db: PrismaClient) {}

  async list(input: ActivityListInput): Promise<ActivityListResult> {
    const [auditItems, attachmentItems, taskItems, notificationItems, approvalItems, paymentItems, serviceItems, mailItems] =
      await Promise.all([
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

    const data = merged.slice(0, input.limit).map((item): ActivityItem => {
      const actorLabel = item.actorId ? (actorLabels.get(item.actorId) ?? null) : item.actorLabel;
      const businessSummary =
        item.actorId ? `${actorLabel ?? 'Bir kullanıcı'} ${item.title.toLowerCase()}` : item.title;

      return {
        id: item.id,
        source: item.source,
        sourceType: item.source,
        sourceId: item.sourceId,
        tone: item.tone,
        title: businessSummary,
        businessSummary,
        description: item.description,
        technicalDetails: item.technicalDetails,
        actorLabel,
        actorId: item.actorId,
        module: item.module,
        entityType: item.entityType,
        entityId: item.entityId,
        occurredAt: item.occurredAt.toISOString(),
        href: item.href,
        importance: item.importance,
      };
    });

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

    const fieldValueLabels = await resolveAuditFieldValueLabels(this.db, input.tenantId, logs);

    return logs.map((log): InternalActivityItem => {
      const business = formatAuditLogBusiness({
        action: log.action,
        module: log.module,
        entityType: log.entityType,
        entityLabel: null,
        userLabel: null,
        oldValues: log.oldValues,
        newValues: log.newValues,
        fieldValueLabels,
      });

      // technicalDetails: ham alan değişim listesi (iş dili değil, teknik)
      const technicalDetails =
        business.changes.length > 0
          ? business.changes
              .map((change) => {
                const context = change.lineContext ? `[${change.lineContext}] ` : '';
                return `${context}${change.label}: ${change.oldValue ?? 'boş'} → ${change.newValue ?? 'boş'}`;
              })
              .join('\n')
          : null;

      return {
        id: `audit:${log.id}`,
        source: 'AUDIT' as ActivitySource,
        sourceId: log.id,
        tone: ACTION_TONES[log.action],
        title: business.summary.replace(/^Sistem /, ''),
        description: business.summary,
        technicalDetails,
        actorLabel: null,
        actorId: log.userId,
        module: log.module,
        entityType: log.entityType,
        entityId: log.entityId,
        occurredAt: log.createdAt,
        href: null,
        importance: ACTION_IMPORTANCE[log.action],
      };
    });
  }

  private async listAttachments(input: ActivityListInput): Promise<InternalActivityItem[]> {
    const attachments = await this.db.attachment.findMany({
      where: { tenantId: input.tenantId, entityType: input.entityType, entityId: input.entityId },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return attachments.map((attachment): InternalActivityItem => ({
      id: `attachment:${attachment.id}`,
      source: 'ATTACHMENT' as ActivitySource,
      sourceId: attachment.id,
      tone: 'info',
      title: 'dosya ekledi',
      description: attachment.fileName,
      technicalDetails: null,
      actorLabel: null,
      actorId: attachment.uploadedById,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      occurredAt: attachment.createdAt,
      href: `/api/attachments/${attachment.id}/download`,
      importance: 'low',
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
      source: 'TASK' as ActivitySource,
      sourceId: task.id,
      tone: task.status === 'DONE' ? 'success' : 'warning',
      title: task.status === 'DONE' ? 'görevi tamamladı' : 'görev oluşturdu',
      description: task.detail ? `${task.title} — ${task.detail}` : task.title,
      technicalDetails: null,
      actorLabel: null,
      actorId: task.createdById,
      module: task.module ?? 'tasks',
      entityType: task.entityType ?? input.entityType,
      entityId: task.entityId ?? input.entityId,
      occurredAt: task.createdAt,
      href: task.href,
      importance: task.status === 'DONE' ? 'medium' : 'low',
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
      source: 'NOTIFICATION' as ActivitySource,
      sourceId: notification.id,
      tone: notification.status === 'READ' ? 'neutral' : 'info',
      title: notification.title,
      description: notification.message
        ? `${notification.title} — ${notification.message}`
        : notification.title,
      technicalDetails: null,
      actorLabel: null,
      actorId: null,
      module: notification.module,
      entityType: notification.entityType ?? input.entityType,
      entityId: notification.entityId ?? input.entityId,
      occurredAt: notification.createdAt,
      href: null,
      importance: 'low',
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
        source: 'APPROVAL' as ActivitySource,
        sourceId: request.id,
        tone:
          request.status === 'APPROVED'
            ? 'success'
            : request.status === 'REJECTED'
              ? 'danger'
              : 'warning',
        title: 'onay süreci başlattı',
        description: request.notes,
        technicalDetails: null,
        actorLabel: null,
        actorId: request.requestedBy,
        module: 'approvals',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: request.createdAt,
        href: '/dashboard/approvals',
        importance:
          request.status === 'APPROVED' || request.status === 'REJECTED' ? 'high' : 'medium',
      };

      const actionItems = request.actions.map((action): InternalActivityItem => {
        const actionLabel = APPROVAL_ACTION_LABELS[action.actionType] ?? action.actionType.toLowerCase();
        return {
          id: `approval-action:${action.id}`,
          source: 'APPROVAL' as ActivitySource,
          sourceId: action.id,
          tone:
            action.actionType === 'APPROVE'
              ? 'success'
              : action.actionType === 'REJECT'
                ? 'danger'
                : 'info',
          title: actionLabel,
          description: action.notes,
          technicalDetails: null,
          actorLabel: null,
          actorId: action.actorId,
          module: 'approvals',
          entityType: input.entityType,
          entityId: input.entityId,
          occurredAt: action.createdAt,
          href: '/dashboard/approvals',
          importance: action.actionType === 'APPROVE' || action.actionType === 'REJECT' ? 'high' : 'medium',
        };
      });

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
        source: 'PAYMENT' as ActivitySource,
        sourceId: allocation.id,
        tone: 'success',
        title: 'faturaya ödeme bağladı',
        description: `${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(allocation.amount.toNumber())} tahsis edildi. ${paymentDescription(allocation.payment.amount, allocation.payment.method, allocation.payment.reference)}`,
        technicalDetails: null,
        actorLabel: null,
        actorId: allocation.payment.createdById,
        module: 'payments',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: allocation.createdAt,
        href: paymentHref(allocation.payment.id),
        importance: 'high',
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
        source: 'PAYMENT' as ActivitySource,
        sourceId: payment.id,
        tone: payment.status === 'COMPLETED' ? 'success' : 'warning',
        title: 'ödeme kaydetti',
        description: paymentDescription(payment.amount, payment.method, payment.reference),
        technicalDetails: null,
        actorLabel: null,
        actorId: payment.createdById,
        module: 'payments',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: payment.createdAt,
        href: paymentHref(payment.id),
        importance: 'high',
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
        source: 'SERVICE' as ActivitySource,
        sourceId: activity.id,
        tone: 'info',
        title: SERVICE_ACTIVITY_LABELS[activity.activityType],
        description: activity.notes,
        technicalDetails: null,
        actorLabel: null,
        actorId: activity.actorId,
        module: 'service',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: activity.createdAt,
        href: `/dashboard/service/requests/${input.entityId}`,
        importance: SERVICE_ACTIVITY_IMPORTANCE[activity.activityType],
      })),
      ...histories.map((history): InternalActivityItem => ({
        id: `service-history:${history.id}`,
        source: 'SERVICE' as ActivitySource,
        sourceId: history.id,
        tone: 'info',
        title: 'servis durumunu değiştirdi',
        description: `${history.fromStatus ?? 'Başlangıç'} → ${history.toStatus}${history.notes ? ` — ${history.notes}` : ''}`,
        technicalDetails: null,
        actorLabel: null,
        actorId: history.createdById,
        module: 'service',
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: history.createdAt,
        href: `/dashboard/service/requests/${input.entityId}`,
        importance: 'high',
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
      source: 'MAIL' as ActivitySource,
      sourceId: mail.id,
      tone: mailTone(mail.status),
      title:
        mail.direction === MailDirection.INBOUND ? 'Mail alındı' : mailStatusTitle(mail.status),
      description: `${mail.subject}${mail.attachmentCount > 0 ? ` (${mail.attachmentCount} ek)` : ''}${mail.textPreview ? ` — ${mail.textPreview}` : ''}`,
      technicalDetails: null,
      actorLabel: null,
      actorId: mail.sentById,
      module: 'mail',
      entityType: input.entityType,
      entityId: input.entityId,
      occurredAt: mail.sentAt ?? mail.createdAt,
      href: `/dashboard/mail?mailId=${mail.id}`,
      importance: mailImportance(mail.status),
    }));
  }
}
