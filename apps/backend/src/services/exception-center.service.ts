import { AutomationExecutionStatus, DomainEventOutboxStatus, EntityType, InvoiceStatus, InvoiceType, JournalEntryType, Priority, PurchaseOrderStatus, TaskStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { PurchaseThreeWayMatchService } from './purchase-three-way-match.service.js';

type ExceptionDbClient = PrismaClient;
export type ExceptionCategory =
  | 'stock_unavailable'
  | 'payment_unmatched'
  | 'invoice_overdue'
  | 'approval_required'
  | 'marketplace_sku_missing'
  | 'accounting_failed'
  | 'edocument_rejected'
  | 'automation_failed'
  | 'domain_event_dead_letter'
  | 'purchase_three_way_mismatch'
  | 'workflow_task';
export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ExceptionStatus = 'OPEN' | 'IN_PROGRESS' | 'FAILED' | 'BLOCKED';

export interface ExceptionCenterItem {
  id: string;
  category: ExceptionCategory;
  title: string;
  detail: string | null;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  module: string;
  entityType: EntityType | string | null;
  entityId: string | null;
  href: string;
  source: string;
  occurredAt: string;
}

export interface ExceptionCenterSummaryItem {
  category: ExceptionCategory;
  label: string;
  count: number;
  highestSeverity: ExceptionSeverity | null;
}

export interface ExceptionCenterSnapshot {
  generatedAt: string;
  total: number;
  critical: number;
  high: number;
  byCategory: ExceptionCenterSummaryItem[];
  items: ExceptionCenterItem[];
}

const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  stock_unavailable: 'Stock unavailable',
  payment_unmatched: 'Payment unmatched',
  invoice_overdue: 'Invoice overdue',
  approval_required: 'Approval required',
  marketplace_sku_missing: 'Marketplace SKU missing',
  accounting_failed: 'Accounting failed',
  edocument_rejected: 'E-Document rejected',
  automation_failed: 'Automation failed',
  domain_event_dead_letter: 'Domain event failure',
  purchase_three_way_mismatch: 'Purchase three-way mismatch',
  workflow_task: 'Workflow task',
};

const SEVERITY_RANK: Record<ExceptionSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function iso(value: Date): string {
  return value.toISOString();
}

function daysLate(dueDate: Date | null, now: Date): number {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000));
}

function invoiceSeverity(lateDays: number): ExceptionSeverity {
  if (lateDays >= 30) return 'CRITICAL';
  if (lateDays >= 7) return 'HIGH';
  return 'MEDIUM';
}

function priorityToSeverity(priority: Priority): ExceptionSeverity {
  if (priority === Priority.CRITICAL) return 'CRITICAL';
  if (priority === Priority.HIGH) return 'HIGH';
  if (priority === Priority.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function taskStatusToExceptionStatus(status: TaskStatus): ExceptionStatus {
  return status === TaskStatus.IN_PROGRESS ? 'IN_PROGRESS' : 'OPEN';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown three-way match error';
}

function buildSummary(items: readonly ExceptionCenterItem[]): ExceptionCenterSummaryItem[] {
  return (Object.keys(CATEGORY_LABELS) as ExceptionCategory[]).map((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    const highestSeverity = categoryItems
      .map((item) => item.severity)
      .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0] ?? null;
    return {
      category,
      label: CATEGORY_LABELS[category],
      count: categoryItems.length,
      highestSeverity,
    };
  });
}

export class ExceptionCenterService {
  constructor(private readonly db: ExceptionDbClient) {}

  async snapshot(tenantId: string): Promise<ExceptionCenterSnapshot> {
    const now = new Date();
    const [
      tasks,
      unmatchedBankTransactions,
      overdueInvoices,
      failedAutomationExecutions,
      failedDomainEvents,
      unpostedAutoJournalEntries,
      purchaseOrders,
    ] = await Promise.all([
      this.db.task.findMany({
        where: { tenantId, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.db.bankTransaction.findMany({
        where: { tenantId, refId: null, refType: null },
        select: { id: true, amount: true, date: true, description: true, reference: true },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.db.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          type: InvoiceType.SALES,
          OR: [
            { status: InvoiceStatus.OVERDUE },
            { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: now } },
          ],
        },
        select: { id: true, number: true, dueDate: true, totalGross: true, contact: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
      this.db.automationExecution.findMany({
        where: { tenantId, status: AutomationExecutionStatus.FAILED },
        select: { id: true, ruleId: true, trigger: true, action: true, entityType: true, entityId: true, error: true, startedAt: true, rule: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
      this.db.domainEventOutbox.findMany({
        where: { tenantId, status: { in: [DomainEventOutboxStatus.FAILED, DomainEventOutboxStatus.DEAD_LETTER] } },
        select: { id: true, name: true, entityType: true, entityId: true, status: true, attempts: true, lastError: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.db.journalEntry.findMany({
        where: { tenantId, isPosted: false, type: { in: [JournalEntryType.AUTO_INVOICE, JournalEntryType.AUTO_PAYMENT] } },
        select: { id: true, number: true, type: true, refType: true, refId: true, description: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.db.purchaseOrder.findMany({
        where: { tenantId, deletedAt: null, status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.RECEIVED] } },
        select: { id: true, number: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
    ]);

    const matcher = new PurchaseThreeWayMatchService(this.db);
    const threeWayResults = await Promise.all(
      purchaseOrders.map(async (order) => {
        try {
          const result = await matcher.evaluate(tenantId, order.id);
          return { order, result, error: null };
        } catch (error) {
          return { order, result: null, error: errorMessage(error) };
        }
      }),
    );

    const items: ExceptionCenterItem[] = [
      ...tasks.map((task): ExceptionCenterItem => ({
        id: `task:${task.id}`,
        category: task.type === 'APPROVAL' ? 'approval_required' : 'workflow_task',
        title: task.title,
        detail: task.detail,
        severity: priorityToSeverity(task.priority),
        status: taskStatusToExceptionStatus(task.status),
        module: task.module ?? 'workflow',
        entityType: task.entityType,
        entityId: task.entityId,
        href: task.href ?? '/dashboard/workflow',
        source: task.source ?? `task:${task.id}`,
        occurredAt: iso(task.createdAt),
      })),
      ...unmatchedBankTransactions.map((transaction): ExceptionCenterItem => ({
        id: `bank:${transaction.id}`,
        category: 'payment_unmatched',
        title: 'Unmatched bank transaction',
        detail: `${numberValue(transaction.amount).toFixed(2)} TRY - ${transaction.description ?? transaction.reference ?? 'No description'}`,
        severity: numberValue(transaction.amount) >= 100_000 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        module: 'accounting',
        entityType: EntityType.OTHER,
        entityId: transaction.id,
        href: '/dashboard/bank-transactions',
        source: `bank-transaction:${transaction.id}`,
        occurredAt: iso(transaction.date),
      })),
      ...overdueInvoices.map((invoice): ExceptionCenterItem => {
        const lateDays = daysLate(invoice.dueDate, now);
        return {
          id: `invoice:${invoice.id}`,
          category: 'invoice_overdue',
          title: `${invoice.number} overdue invoice`,
          detail: `${invoice.contact?.name ?? 'Contact'} - ${numberValue(invoice.totalGross).toFixed(2)} TRY - ${lateDays} days late`,
          severity: invoiceSeverity(lateDays),
          status: 'OPEN',
          module: 'invoicing',
          entityType: EntityType.INVOICE,
          entityId: invoice.id,
          href: `/dashboard/invoices/${invoice.id}`,
          source: `invoice:${invoice.id}`,
          occurredAt: iso(invoice.dueDate ?? now),
        };
      }),
      ...failedAutomationExecutions.map((execution): ExceptionCenterItem => ({
        id: `automation:${execution.id}`,
        category: 'automation_failed',
        title: execution.rule?.name ?? 'Automation execution failed',
        detail: execution.error ?? `${execution.trigger ?? '-'} / ${execution.action ?? '-'}`,
        severity: 'HIGH',
        status: 'FAILED',
        module: 'workflow',
        entityType: execution.entityType,
        entityId: execution.entityId,
        href: '/dashboard/workflow',
        source: `automation-execution:${execution.id}`,
        occurredAt: iso(execution.startedAt),
      })),
      ...failedDomainEvents.map((event): ExceptionCenterItem => ({
        id: `domain-event:${event.id}`,
        category: 'domain_event_dead_letter',
        title: event.name,
        detail: event.lastError ?? `${event.status} after ${event.attempts} attempts`,
        severity: event.status === DomainEventOutboxStatus.DEAD_LETTER ? 'CRITICAL' : 'HIGH',
        status: event.status === DomainEventOutboxStatus.DEAD_LETTER ? 'BLOCKED' : 'FAILED',
        module: 'settings',
        entityType: event.entityType,
        entityId: event.entityId,
        href: '/dashboard/settings/domain-events',
        source: `domain-event:${event.id}`,
        occurredAt: iso(event.createdAt),
      })),
      ...unpostedAutoJournalEntries.map((entry): ExceptionCenterItem => ({
        id: `journal:${entry.id}`,
        category: 'accounting_failed',
        title: `${entry.number} not posted`,
        detail: entry.description ?? `${entry.type} draft waiting for posting`,
        severity: 'HIGH',
        status: 'OPEN',
        module: 'accounting',
        entityType: EntityType.OTHER,
        entityId: entry.id,
        href: '/dashboard/accounting/journal-entries',
        source: `journal-entry:${entry.id}`,
        occurredAt: iso(entry.createdAt),
      })),
      ...threeWayResults
        .filter(({ result, error }) => result?.summary.status === 'EXCEPTION' || error !== null)
        .map(({ order, result, error }): ExceptionCenterItem => ({
          id: `three-way:${order.id}`,
          category: 'purchase_three_way_mismatch',
          title: `${order.number} three-way mismatch`,
          detail: error ?? `${result?.summary.errorCount ?? 0} errors, ${result?.summary.warningCount ?? 0} warnings`,
          severity: error || (result?.summary.errorCount ?? 0) > 0 ? 'HIGH' : 'MEDIUM',
          status: error ? 'FAILED' : 'OPEN',
          module: 'purchasing',
          entityType: EntityType.PURCHASE_ORDER,
          entityId: order.id,
          href: `/dashboard/purchase-orders/${order.id}`,
          source: `three-way:${order.id}`,
          occurredAt: iso(order.updatedAt),
        })),
    ].sort((a, b) => {
      const priorityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    });

    return {
      generatedAt: iso(now),
      total: items.length,
      critical: items.filter((item) => item.severity === 'CRITICAL').length,
      high: items.filter((item) => item.severity === 'HIGH').length,
      byCategory: buildSummary(items),
      items: items.slice(0, 100),
    };
  }
}
