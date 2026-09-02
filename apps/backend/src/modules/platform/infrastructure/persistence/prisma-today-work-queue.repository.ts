import { ApprovalStatus, InvoiceStatus, PermissionAction, TaskStatus, type PrismaClient } from '@prisma/client';
import { getTenantPermissionContext } from '../../../../lib/tenant-permissions.js';
import { ExceptionCenterService } from '../../../../services/exception-center.service.js';
import type { TodayWorkCandidate, TodayWorkKind, TodayWorkQueueRepository, TodayWorkRisk } from '../../application/today-work-queue/index.js';

function taskRisk(priority: string): TodayWorkRisk {
  return priority === 'CRITICAL' ? 'CRITICAL' : priority === 'HIGH' ? 'HIGH' : priority === 'MEDIUM' ? 'MEDIUM' : 'LOW';
}

function exceptionKind(category: string): TodayWorkKind {
  if (category === 'automation_failed' || category === 'domain_event_dead_letter') return 'AUTOMATION_EXCEPTION';
  if (category === 'marketplace_sku_missing' || category === 'purchase_three_way_mismatch') return 'DATA_QUALITY';
  return 'ANOMALY';
}

export class PrismaTodayWorkQueueRepository implements TodayWorkQueueRepository {
  constructor(private readonly db: PrismaClient) {}

  async findCandidates(tenantId: string, userId: string, now: Date): Promise<readonly TodayWorkCandidate[]> {
    const permission = await getTenantPermissionContext(tenantId, userId);
    if (!permission) return [];
    const canRead = (module: string): boolean => permission.can(PermissionAction.READ, module);
    const [tasks, approvals, invoices, exceptions] = await Promise.all([
      canRead('tasks') ? this.db.task.findMany({
        where: { tenantId, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] }, OR: [{ assignedToId: userId }, { assignedToId: null }] },
        take: 40,
      }) : [],
      canRead('approvals') ? this.db.approvalRequest.findMany({
        where: { tenantId, status: ApprovalStatus.PENDING },
        select: {
          id: true, createdAt: true, entityType: true, entityId: true, currentStep: true,
          flow: { select: { name: true, module: true, steps: { select: { stepOrder: true, approverUserId: true, approverRoleId: true } } } },
        }, take: 20,
      }) : [],
      canRead('invoicing') ? this.db.invoice.findMany({
        where: { tenantId, deletedAt: null, type: 'SALES', OR: [{ status: InvoiceStatus.OVERDUE }, { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: now } }] },
        select: { id: true, number: true, dueDate: true, totalGross: true, createdAt: true, contact: { select: { name: true } } }, take: 20,
      }) : [],
      new ExceptionCenterService(this.db).snapshot(tenantId),
    ]);
    const assigneeIds = [...new Set(tasks.map((task) => task.assignedToId).filter((id): id is string => Boolean(id)))];
    const assignees = assigneeIds.length > 0
      ? await this.db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
      : [];
    const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));

    const taskItems: TodayWorkCandidate[] = tasks.map((task) => ({
      id: `task:${task.id}`, sourceId: task.id, kind: 'TASK', title: task.title, detail: task.detail,
      risk: taskRisk(task.priority), dueAt: task.dueAt, occurredAt: task.createdAt, monetaryImpact: null,
      assignee: task.assignedToId ? assigneeById.get(task.assignedToId) ?? null : null,
      reason: task.dueAt && task.dueAt < now ? 'Görevin SLA süresi doldu.' : 'Size veya ekibinize atanmış açık görev.',
      action: { kind: 'COMPLETE', label: 'Tamamla', href: task.href ?? '/dashboard/workflow' },
    }));
    const approvalItems: TodayWorkCandidate[] = approvals.filter((approval) => {
      if (permission.isOwner) return true;
      const step = approval.flow.steps.find((candidate) => candidate.stepOrder === approval.currentStep);
      return step?.approverUserId === userId || Boolean(permission.roleId && step?.approverRoleId === permission.roleId);
    }).map((approval) => ({
      id: `approval:${approval.id}`, sourceId: approval.id, kind: 'APPROVAL', title: `${approval.flow.name} onayı`,
      detail: `${approval.entityType} kaydı karar bekliyor.`, risk: 'HIGH', dueAt: new Date(approval.createdAt.getTime() + 24 * 60 * 60 * 1000),
      occurredAt: approval.createdAt, monetaryImpact: null, assignee: null, reason: `${approval.flow.module} süreci onay olmadan ilerleyemiyor.`,
      action: { kind: 'OPEN', label: 'İncele ve karar ver', href: `/dashboard/approvals?requestId=${approval.id}` },
    }));
    const invoiceItems: TodayWorkCandidate[] = invoices.map((invoice) => ({
      id: `invoice:${invoice.id}`, sourceId: invoice.id, kind: 'ANOMALY', title: `${invoice.number} gecikmiş tahsilat`,
      detail: invoice.contact?.name ?? null, risk: invoice.dueDate && now.getTime() - invoice.dueDate.getTime() >= 30 * 86_400_000 ? 'CRITICAL' : 'HIGH',
      dueAt: invoice.dueDate, occurredAt: invoice.createdAt, monetaryImpact: Number(invoice.totalGross), assignee: null,
      reason: 'Vadesi geçen satış faturası nakit akışını etkiliyor.', action: { kind: 'OPEN', label: 'Tahsilatı yönet', href: `/dashboard/invoices/${invoice.id}` },
    }));
    const representedCategories = new Set(['workflow_task', 'invoice_overdue', 'approval_required']);
    const exceptionItems: TodayWorkCandidate[] = exceptions.items
      .filter((item) => canRead(item.module) && !representedCategories.has(item.category))
      .slice(0, 20).map((item) => ({
      id: `exception:${item.id}`, sourceId: item.id, kind: exceptionKind(item.category), title: item.title, detail: item.detail,
      risk: item.severity, dueAt: item.severity === 'CRITICAL' ? now : null, occurredAt: new Date(item.occurredAt),
      monetaryImpact: null, assignee: null, reason: `${item.module} modülünde ${item.category} istisnası tespit edildi.`,
      action: { kind: 'OPEN', label: 'Sorunu çöz', href: item.href },
    }));
    return [...taskItems, ...approvalItems, ...invoiceItems, ...exceptionItems];
  }
}
