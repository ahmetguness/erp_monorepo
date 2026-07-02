import { AuditAction, EntityType, FeatureKey, NotificationStatus, Prisma, PrismaClient } from '@prisma/client';
import { TenantFeatureService } from './tenant-feature.service.js';

type AuditAlertDb = PrismaClient | Prisma.TransactionClient;

export interface AuditAlertInput {
  tenantId: string;
  actorUserId: string | null;
  module: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
}

const CRITICAL_AUDIT_ACTIONS: readonly AuditAction[] = [
  AuditAction.DELETE,
  AuditAction.APPROVE,
  AuditAction.REJECT,
  AuditAction.EXPORT,
];

const ALERT_EXCLUDED_MODULES = new Set(['notifications']);

function isCriticalAuditAction(action: AuditAction): boolean {
  return CRITICAL_AUDIT_ACTIONS.includes(action);
}

function actionLabel(action: AuditAction): string {
  switch (action) {
    case AuditAction.DELETE:
      return 'silme';
    case AuditAction.APPROVE:
      return 'onay';
    case AuditAction.REJECT:
      return 'red';
    case AuditAction.EXPORT:
      return 'dışa aktarım';
    default:
      return action.toLowerCase();
  }
}

async function hasStandardAuditLog(db: AuditAlertDb, tenantId: string): Promise<boolean> {
  const service = new TenantFeatureService(db as PrismaClient);
  const feature = await service.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
  return feature.value === 'standard' || feature.value === 'full';
}

async function resolveAlertRecipients(db: AuditAlertDb, tenantId: string, actorUserId: string | null): Promise<string[]> {
  const users = await db.tenantUser.findMany({
    where: {
      tenantId,
      isActive: true,
      user: { isActive: true, deletedAt: null },
      OR: [
        { isOwner: true },
        {
          roleRef: {
            permissions: {
              some: { module: 'audit_logs', action: 'READ' },
            },
          },
        },
      ],
    },
    select: { userId: true },
  });

  return [...new Set(users.map((user) => user.userId).filter((userId) => userId !== actorUserId))];
}

export async function createAuditCriticalActionAlert(db: AuditAlertDb, input: AuditAlertInput): Promise<void> {
  if (!isCriticalAuditAction(input.action)) return;
  if (ALERT_EXCLUDED_MODULES.has(input.module)) return;
  if (!(await hasStandardAuditLog(db, input.tenantId))) return;

  const recipients = await resolveAlertRecipients(db, input.tenantId, input.actorUserId);
  if (recipients.length === 0) return;

  const title = 'Kritik denetim aksiyonu';
  const message = `${input.module} modülünde ${actionLabel(input.action)} işlemi gerçekleşti. Kayıt: ${input.entityId}`;

  await db.notification.createMany({
    data: recipients.map((userId) => ({
      tenantId: input.tenantId,
      userId,
      title,
      message,
      module: 'audit_logs',
      entityType: input.entityType,
      entityId: input.entityId,
      status: NotificationStatus.UNREAD,
    })),
  });
}
