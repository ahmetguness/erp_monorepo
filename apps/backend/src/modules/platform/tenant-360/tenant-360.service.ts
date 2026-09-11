import type { AdminPermission, Tenant360Snapshot } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { NotFoundError } from '../../../errors/index.js';
import { PlanUsageService } from '../../../services/plan-usage.service.js';

export async function getTenant360(tenantId: string, permissions: readonly AdminPermission[]): Promise<Tenant360Snapshot> {
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!tenant) throw new NotFoundError('Tenant bulunamadı');
  const billingSubscription = await prisma.billingSubscription.findFirst({ where: { tenantId }, select: { provider: true, state: true, monthlyAmount: true, currency: true } });
  const operationsAllowed = permissions.includes('operations.read');
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29);
  const [usage, activity, integrations, jobs, events, failedJobs, failedEvents, members, changes, support] = await Promise.all([
    new PlanUsageService(prisma).getSummary(tenantId),
    prisma.$queryRaw<Array<{ date: string; actions: number; users: number }>>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS date,
        count(*)::int AS actions, count(DISTINCT "userId")::int AS users
      FROM audit_logs WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since} AND "userId" IS NOT NULL
      GROUP BY 1 ORDER BY 1`,
    operationsAllowed ? prisma.marketplaceIntegration.findMany({ where: { tenantId }, select: { id: true, name: true, channel: true, isActive: true, lastSyncAt: true, syncErrors: true } }) : null,
    operationsAllowed ? prisma.marketplaceSyncJob.groupBy({ by: ['status'], where: { tenantId }, _count: true }) : [],
    operationsAllowed ? prisma.domainEventOutbox.groupBy({ by: ['status'], where: { tenantId }, _count: true }) : [],
    operationsAllowed ? prisma.marketplaceSyncJob.findMany({ where: { tenantId, status: { in: ['FAILED', 'DEAD_LETTER'] } }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, jobType: true, status: true, attempts: true, updatedAt: true } }) : [],
    operationsAllowed ? prisma.domainEventOutbox.findMany({ where: { tenantId, status: { in: ['FAILED', 'DEAD_LETTER'] } }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, name: true, status: true, attempts: true, updatedAt: true } }) : [],
    permissions.includes('security.read') ? prisma.tenantUser.findMany({ where: { tenantId }, orderBy: { id: 'asc' }, take: 200, select: { isActive: true, isOwner: true, roleRef: { select: { name: true } }, user: { select: { id: true, name: true, email: true, isActive: true, deletedAt: true } } } }) : null,
    permissions.includes('audit.read') ? prisma.auditLog.findMany({ where: { tenantId, adminId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, module: true, action: true, entityId: true, reason: true, ticketId: true, createdAt: true, admin: { select: { id: true, name: true, email: true } } } }) : null,
    prisma.tenantSupportNote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, body: true, ticketId: true, createdAt: true, author: { select: { id: true, name: true, email: true } } } }),
  ]);
  const lastActivity = members ? await prisma.auditLog.groupBy({ by: ['userId'], where: { tenantId, userId: { in: members.map(member => member.user.id) } }, _max: { createdAt: true } }) : [];
  const reasons: string[] = [];
  if (!['ACTIVE', 'TRIAL'].includes(tenant.status)) reasons.push(`Tenant durumu: ${tenant.status}`);
  if (usage.metrics.some(metric => metric.status === 'full' && (metric.used > 0 || (metric.limit ?? 0) > 0))) reasons.push('En az bir kota dolu.');
  if (failedJobs.length || failedEvents.length) reasons.push('Başarısız operasyon kayıtları var.');
  if (integrations?.some(integration => integration.syncErrors > 0)) reasons.push('Entegrasyon hataları var.');
  if (billingSubscription?.state === 'PAST_DUE') reasons.push('Abonelik tahsilatı gecikmiş durumda.');
  return {
    tenantId, companyName: tenant.companyName, generatedAt: new Date().toISOString(),
    health: { status: reasons.length ? 'ATTENTION' : 'OK', reasons },
    usage: { metrics: usage.metrics, activitySource: 'Son 30 gün, UTC; denetim kaydı üreten kullanıcı işlemleri. Oturum/ziyaret sayısı değildir.', dailyActivity: Array.from({ length: 30 }, (_, index) => {
      const date = new Date(since); date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return activity.find(row => row.date === key) ?? { date: key, actions: 0, users: 0 };
    }) },
    subscription: { plan: tenant.plan, status: tenant.status, trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null, start: tenant.subscriptionStart?.toISOString() ?? null, end: tenant.subscriptionEnd?.toISOString() ?? null, userPrice: tenant.userPrice?.toString() ?? null, customPricing: tenant.isCustomPricing, billingNote: billingSubscription ? `${billingSubscription.provider} · ${billingSubscription.state} · ${billingSubscription.monthlyAmount.toFixed(2)} ${billingSubscription.currency}/ay` : 'Abonelik kaydı henüz oluşturulmadı.' },
    integrations: integrations?.map(row => ({ ...row, lastSyncAt: row.lastSyncAt?.toISOString() ?? null })) ?? null,
    operations: operationsAllowed ? {
      queue: [...jobs.map(row => ({ source: 'Marketplace', status: row.status, count: row._count })), ...events.map(row => ({ source: 'Domain event', status: row.status, count: row._count }))],
      recentFailures: [...failedJobs.map(row => ({ id: row.id, source: 'Marketplace', name: row.jobType, status: row.status, attempts: row.attempts, updatedAt: row.updatedAt.toISOString() })), ...failedEvents.map(row => ({ ...row, source: 'Domain event', updatedAt: row.updatedAt.toISOString() }))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20),
    } : null,
    security: members ? { members: members.map(row => ({ id: row.user.id, name: row.user.name, email: row.user.email, isActive: row.isActive && row.user.isActive && row.user.deletedAt === null, isOwner: row.isOwner, role: row.roleRef?.name ?? null, lastTenantActivityAt: lastActivity.find(item => item.userId === row.user.id)?._max.createdAt?.toISOString() ?? null })) } : null,
    changes: changes?.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) ?? null,
    support: support.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}
