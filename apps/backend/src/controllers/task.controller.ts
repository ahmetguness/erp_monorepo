import { Context } from 'hono';
import { ApprovalStatus, InvoiceStatus, PermissionAction, Priority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';

type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TaskType = 'APPROVAL' | 'COLLECTION' | 'SERVICE' | 'NOTIFICATION' | 'CHECK';

interface TaskItem {
  id: string;
  type: TaskType;
  title: string;
  detail: string | null;
  priority: TaskPriority;
  dueAt: Date | null;
  href: string;
  sourceId: string;
}

function invoicePriority(daysLate: number): TaskPriority {
  if (daysLate >= 30) return 'CRITICAL';
  if (daysLate >= 7) return 'HIGH';
  return 'MEDIUM';
}

export const TaskController = {
  async listMyTasks(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86_400_000);

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, userId, isActive: true },
      select: {
        roleId: true,
        isOwner: true,
        roleRef: { select: { permissions: { select: { module: true, action: true } } } },
      },
    });

    if (!tenantUser) {
      return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
    }

    const canRead = (module: string): boolean =>
      tenantUser.isOwner ||
      (tenantUser.roleRef?.permissions.some((permission) => permission.module === module && permission.action === PermissionAction.READ) ?? false);

    const notifications = canRead('notifications')
      ? await prisma.notification.findMany({
          where: { tenantId, userId, status: 'UNREAD' },
          select: { id: true, title: true, message: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const approvals = canRead('approvals')
      ? await prisma.approvalRequest.findMany({
          where: { tenantId, status: ApprovalStatus.PENDING },
          select: {
            id: true,
            entityType: true,
            entityId: true,
            currentStep: true,
            createdAt: true,
            flow: {
              select: {
                module: true,
                name: true,
                steps: { select: { stepOrder: true, approverRoleId: true, approverUserId: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 25,
        })
      : [];

    const overdueInvoices = canRead('invoicing')
      ? await prisma.invoice.findMany({
          where: {
            tenantId,
            deletedAt: null,
            type: 'SALES',
            OR: [
              { status: InvoiceStatus.OVERDUE },
              { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: now } },
            ],
          },
          select: {
            id: true,
            number: true,
            dueDate: true,
            totalGross: true,
            contact: { select: { name: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 10,
        })
      : [];

    const serviceRequests = canRead('service')
      ? await prisma.serviceRequest.findMany({
          where: {
            tenantId,
            deletedAt: null,
            assignedToId: userId,
            status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER'] },
          },
          select: { id: true, number: true, subject: true, priority: true, createdAt: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: 10,
        })
      : [];

    const dueChecks = canRead('accounting')
      ? await prisma.checkPromissoryNote.findMany({
          where: {
            tenantId,
            deletedAt: null,
            status: { in: ['PENDING', 'DEPOSITED'] },
            dueDate: { lte: soon },
          },
          select: { id: true, number: true, type: true, amount: true, dueDate: true, status: true },
          orderBy: { dueDate: 'asc' },
          take: 10,
        })
      : [];

    const tasks: TaskItem[] = [
      ...notifications.map((notification): TaskItem => ({
        id: `notification:${notification.id}`,
        type: 'NOTIFICATION',
        title: notification.title,
        detail: notification.message,
        priority: 'LOW',
        dueAt: notification.createdAt,
        href: '/dashboard',
        sourceId: notification.id,
      })),
      ...approvals.filter((approval) => {
        if (tenantUser.isOwner) return true;
        const currentStep = approval.flow.steps.find((step) => step.stepOrder === approval.currentStep);
        if (!currentStep) return false;
        return currentStep.approverUserId === userId || Boolean(tenantUser.roleId && currentStep.approverRoleId === tenantUser.roleId);
      }).slice(0, 10).map((approval): TaskItem => ({
        id: `approval:${approval.id}`,
        type: 'APPROVAL',
        title: `${approval.flow.module} onayi`,
        detail: approval.flow.name,
        priority: 'HIGH',
        dueAt: approval.createdAt,
        href: '/dashboard/approvals',
        sourceId: approval.id,
      })),
      ...overdueInvoices.map((invoice): TaskItem => {
        const due = invoice.dueDate ?? now;
        const daysLate = Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
        return {
          id: `invoice:${invoice.id}`,
          type: 'COLLECTION',
          title: `${invoice.number} tahsilat takibi`,
          detail: `${invoice.contact?.name ?? 'Cari'} - ${Number(invoice.totalGross).toFixed(2)} TRY - ${daysLate} gun gecikmis`,
          priority: invoicePriority(daysLate),
          dueAt: invoice.dueDate,
          href: `/dashboard/invoices/${invoice.id}`,
          sourceId: invoice.id,
        };
      }),
      ...serviceRequests.map((request): TaskItem => ({
        id: `service:${request.id}`,
        type: 'SERVICE',
        title: `${request.number} servis gorevi`,
        detail: request.subject,
        priority: request.priority === Priority.CRITICAL ? 'CRITICAL' : request.priority === Priority.HIGH ? 'HIGH' : 'MEDIUM',
        dueAt: request.createdAt,
        href: `/dashboard/service/requests/${request.id}`,
        sourceId: request.id,
      })),
      ...dueChecks.map((check): TaskItem => ({
        id: `check:${check.id}`,
        type: 'CHECK',
        title: `${check.number} cek/senet takibi`,
        detail: `${check.type} - ${Number(check.amount).toFixed(2)} TRY - ${check.status}`,
        priority: check.dueDate < now ? 'HIGH' : 'MEDIUM',
        dueAt: check.dueDate,
        href: '/dashboard/check-promissory',
        sourceId: check.id,
      })),
    ].sort((a, b) => {
      const rank: Record<TaskPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const priorityDiff = rank[a.priority] - rank[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
    });

    return c.json({
      data: tasks.slice(0, 30),
      meta: {
        total: tasks.length,
        counts: tasks.reduce<Record<TaskType, number>>(
          (acc, task) => {
            acc[task.type] = (acc[task.type] ?? 0) + 1;
            return acc;
          },
          { APPROVAL: 0, COLLECTION: 0, SERVICE: 0, NOTIFICATION: 0, CHECK: 0 },
        ),
      },
    });
  },
};
