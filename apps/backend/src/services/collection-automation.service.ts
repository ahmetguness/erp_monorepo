import { EntityType, InvoiceStatus, InvoiceType, Priority, TaskType, type Prisma, type PrismaClient } from '@prisma/client';
import { createTask } from './task.service.js';

type CollectionAutomationDbClient = PrismaClient | Prisma.TransactionClient;
export type CollectionAutomationStage = 'PRE_DUE' | 'DUE_DATE' | 'EMAIL_DRAFT' | 'FOLLOW_UP_TASK' | 'ESCALATION' | 'CLOSE_PAID';
export type CollectionAutomationStatus = 'CREATED' | 'SKIPPED' | 'CLOSED';

export interface CollectionAutomationItem {
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  stage: CollectionAutomationStage;
  status: CollectionAutomationStatus;
  reminderId: string | null;
  taskId: string | null;
  message: string;
}

export interface CollectionAutomationSnapshot {
  generatedAt: string;
  scanned: number;
  createdReminders: number;
  createdTasks: number;
  closedReminders: number;
  items: CollectionAutomationItem[];
}

interface InvoiceCandidate {
  id: string;
  number: string;
  contactId: string;
  dueDate: Date | null;
  status: InvoiceStatus;
  totalGross: Prisma.Decimal | number;
  payments: Array<{ amount: Prisma.Decimal | number }>;
}

const DAY_MS = 86_400_000;
const PRE_DUE_DAYS = 3;
const EMAIL_DRAFT_DAYS = 3;
const FOLLOW_UP_DAYS = 7;
const DEFAULT_ESCALATION_DAYS = 15;

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number): Date {
  return new Date(startOfDay(value).getTime() + days * DAY_MS);
}

function daysFromDue(dueDate: Date, now: Date): number {
  return Math.floor((startOfDay(now).getTime() - startOfDay(dueDate).getTime()) / DAY_MS);
}

function balance(invoice: InvoiceCandidate): number {
  const paid = invoice.payments.reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  return Math.max(0, numberValue(invoice.totalGross) - paid);
}

function reminderSource(invoiceId: string, stage: CollectionAutomationStage): string {
  return `collection:${stage}:${invoiceId}`;
}

function taskSource(invoiceId: string, stage: CollectionAutomationStage): string {
  return `collection-task:${stage}:${invoiceId}`;
}

async function readEscalationDays(db: CollectionAutomationDbClient, tenantId: string): Promise<number> {
  const setting = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'policies.collection.collectionEscalationDays' } },
    select: { value: true },
  });
  const parsed = Number(setting?.value ?? DEFAULT_ESCALATION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_ESCALATION_DAYS;
}

export class CollectionAutomationService {
  constructor(private readonly db: CollectionAutomationDbClient) {}

  async run(tenantId: string, userId?: string | null): Promise<CollectionAutomationSnapshot> {
    const now = new Date();
    const escalationDays = await readEscalationDays(this.db, tenantId);
    const invoices = await this.db.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: InvoiceType.SALES,
        dueDate: { not: null },
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE, InvoiceStatus.PAID] },
      },
      select: {
        id: true,
        number: true,
        contactId: true,
        dueDate: true,
        status: true,
        totalGross: true,
        payments: { select: { amount: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 300,
    });

    const items: CollectionAutomationItem[] = [];
    for (const invoice of invoices) {
      const invoiceBalance = balance(invoice);
      if (invoice.status === InvoiceStatus.PAID || invoiceBalance <= 0) {
        const closed = await this.closePaidReminders(tenantId, invoice.id);
        if (closed > 0) {
          items.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            contactId: invoice.contactId,
            stage: 'CLOSE_PAID',
            status: 'CLOSED',
            reminderId: null,
            taskId: null,
            message: `${closed} reminder cancelled after payment.`,
          });
        }
        continue;
      }
      if (!invoice.dueDate) continue;

      const lateDays = daysFromDue(invoice.dueDate, now);
      const stages = this.stagesForInvoice(invoice.dueDate, lateDays, escalationDays, now);
      for (const stage of stages) {
        items.push(await this.applyStage(tenantId, invoice, invoiceBalance, stage, userId ?? null));
      }
    }

    return {
      generatedAt: now.toISOString(),
      scanned: invoices.length,
      createdReminders: items.filter((item) => item.reminderId && item.status === 'CREATED').length,
      createdTasks: items.filter((item) => item.taskId && item.status === 'CREATED').length,
      closedReminders: items.filter((item) => item.stage === 'CLOSE_PAID' && item.status === 'CLOSED').length,
      items,
    };
  }

  private stagesForInvoice(
    dueDate: Date,
    lateDays: number,
    escalationDays: number,
    now: Date,
  ): Array<Exclude<CollectionAutomationStage, 'CLOSE_PAID'>> {
    const stages: Array<Exclude<CollectionAutomationStage, 'CLOSE_PAID'>> = [];
    if (startOfDay(now).getTime() >= addDays(dueDate, -PRE_DUE_DAYS).getTime()) stages.push('PRE_DUE');
    if (lateDays >= 0) stages.push('DUE_DATE');
    if (lateDays >= EMAIL_DRAFT_DAYS) stages.push('EMAIL_DRAFT');
    if (lateDays >= FOLLOW_UP_DAYS) stages.push('FOLLOW_UP_TASK');
    if (lateDays >= escalationDays) stages.push('ESCALATION');
    return stages;
  }

  private async applyStage(
    tenantId: string,
    invoice: InvoiceCandidate,
    amount: number,
    stage: Exclude<CollectionAutomationStage, 'CLOSE_PAID'>,
    userId: string | null,
  ): Promise<CollectionAutomationItem> {
    if (stage === 'EMAIL_DRAFT' || stage === 'FOLLOW_UP_TASK' || stage === 'ESCALATION') {
      return this.ensureTask(tenantId, invoice, amount, stage, userId);
    }
    return this.ensureReminder(tenantId, invoice, amount, stage);
  }

  private async ensureReminder(
    tenantId: string,
    invoice: InvoiceCandidate,
    amount: number,
    stage: 'PRE_DUE' | 'DUE_DATE',
  ): Promise<CollectionAutomationItem> {
    const source = reminderSource(invoice.id, stage);
    const existing = await this.db.collectionReminder.findFirst({
      where: { tenantId, invoiceId: invoice.id, notes: { contains: source } },
      select: { id: true },
    });
    if (existing) {
      return this.item(invoice, stage, 'SKIPPED', existing.id, null, 'Reminder already exists.');
    }

    const reminder = await this.db.collectionReminder.create({
      data: {
        tenantId,
        contactId: invoice.contactId,
        invoiceId: invoice.id,
        amount,
        dueDate: stage === 'PRE_DUE' && invoice.dueDate ? addDays(invoice.dueDate, -PRE_DUE_DAYS) : invoice.dueDate ?? new Date(),
        status: 'PENDING',
        notes: `${source} | Automated collection reminder for ${invoice.number}`,
      },
      select: { id: true },
    });
    return this.item(invoice, stage, 'CREATED', reminder.id, null, 'Reminder created.');
  }

  private async ensureTask(
    tenantId: string,
    invoice: InvoiceCandidate,
    amount: number,
    stage: 'EMAIL_DRAFT' | 'FOLLOW_UP_TASK' | 'ESCALATION',
    userId: string | null,
  ): Promise<CollectionAutomationItem> {
    const source = taskSource(invoice.id, stage);
    const existing = await this.db.task.findFirst({ where: { tenantId, source }, select: { id: true } });
    if (existing) return this.item(invoice, stage, 'SKIPPED', null, existing.id, 'Task already exists.');

    const title = stage === 'EMAIL_DRAFT'
      ? `${invoice.number} collection email draft`
      : stage === 'ESCALATION'
        ? `${invoice.number} collection escalation`
        : `${invoice.number} collection follow-up`;
    const detail = `${amount.toFixed(2)} TRY open balance. First version creates a draft/review task instead of sending email.`;
    const task = await createTask(tenantId, {
      title,
      detail,
      type: TaskType.COLLECTION,
      priority: stage === 'ESCALATION' ? Priority.CRITICAL : Priority.HIGH,
      module: 'accounting',
      entityType: EntityType.INVOICE,
      entityId: invoice.id,
      href: `/dashboard/invoices/${invoice.id}`,
      source,
      assignedToId: null,
      createdById: userId,
      dueAt: new Date(),
    }, this.db);
    return this.item(invoice, stage, 'CREATED', null, task.id, 'Task created.');
  }

  private async closePaidReminders(tenantId: string, invoiceId: string): Promise<number> {
    const result = await this.db.collectionReminder.updateMany({
      where: { tenantId, invoiceId, status: { in: ['PENDING', 'SENT', 'FAILED'] } },
      data: { status: 'CANCELLED' },
    });
    return result.count;
  }

  private item(
    invoice: InvoiceCandidate,
    stage: CollectionAutomationStage,
    status: CollectionAutomationStatus,
    reminderId: string | null,
    taskId: string | null,
    message: string,
  ): CollectionAutomationItem {
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      contactId: invoice.contactId,
      stage,
      status,
      reminderId,
      taskId,
      message,
    };
  }
}
