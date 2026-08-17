import { EntityType, InvoiceStatus, InvoiceType, type Prisma, type PrismaClient } from '@prisma/client';
import { AutomationExecutionService } from './automation-execution.service.js';
import { AutomationRuleService } from './automation-rule.service.js';
import { AccountingPostingEngineService } from './accounting-posting-engine.service.js';
import { BankTransactionMatchingService } from './bank-transaction-matching.service.js';
import { CollectionAutomationService } from './collection-automation.service.js';
import { PurchaseAutomationService } from './purchase-automation.service.js';
import { scanAndRecomputeInvoiceStatuses } from './financial/invoice-status.service.js';

type SchedulerDbClient = PrismaClient;
export type SchedulerJobStatus = 'ACTIVE' | 'PLANNED';
export type SchedulerJobRunStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export type SchedulerJobKey =
  | 'invoice_status_recalculation'
  | 'invoice_overdue_scan'
  | 'reservation_cleanup'
  | 'low_stock_reorder'
  | 'collection_reminders'
  | 'batch_expiration'
  | 'lot_expiration'
  | 'bank_auto_match'
  | 'accounting_integrity_check'
  | 'marketplace_sync'
  | 'automation_runner';

export interface SchedulerJobDefinition {
  key: SchedulerJobKey;
  title: string;
  description: string;
  cadence: string;
  module: string;
  status: SchedulerJobStatus;
}

export interface SchedulerJobRunItem {
  jobKey: SchedulerJobKey;
  status: SchedulerJobRunStatus;
  executionId: string | null;
  matched: number;
  changed: number;
  message: string;
}

export interface SchedulerJobEngineResult {
  generatedAt: string;
  requestedJobKey: SchedulerJobKey | 'all';
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: SchedulerJobRunItem[];
}

const JOBS: readonly SchedulerJobDefinition[] = [
  { key: 'invoice_status_recalculation', title: 'Invoice status recalculation', description: 'Acik faturalarin odeme durumlarini yeniden hesaplar.', cadence: 'hourly', module: 'invoicing', status: 'ACTIVE' },
  { key: 'invoice_overdue_scan', title: 'Invoice overdue scan', description: 'Vadesi gecen satis faturalarini OVERDUE durumuna tasir.', cadence: 'daily', module: 'invoicing', status: 'ACTIVE' },
  { key: 'reservation_cleanup', title: 'Reservation cleanup', description: 'Suresi dolmus stok rezervasyonlarini serbest birakir.', cadence: 'hourly', module: 'inventory', status: 'ACTIVE' },
  { key: 'low_stock_reorder', title: 'Low stock reorder', description: 'Dusuk stok onerilerinden satin alma talebi olusturur.', cadence: 'daily', module: 'purchasing', status: 'ACTIVE' },
  { key: 'collection_reminders', title: 'Collection reminders', description: 'Tahsilat takip gorevleri icin otomasyon kurallarini calistirir.', cadence: 'daily', module: 'workflow', status: 'ACTIVE' },
  { key: 'bank_auto_match', title: 'Bank auto match', description: 'Yuksek guvenli banka hareketlerini otomatik eslestirir.', cadence: 'hourly', module: 'accounting', status: 'ACTIVE' },
  { key: 'accounting_integrity_check', title: 'Accounting integrity check', description: 'Otomatik muhasebe posting engine calistirir.', cadence: 'daily', module: 'accounting', status: 'ACTIVE' },
  { key: 'automation_runner', title: 'Automation runner', description: 'Aktif otomasyon kurallarini tetikler.', cadence: 'hourly', module: 'workflow', status: 'ACTIVE' },
  { key: 'batch_expiration', title: 'Batch expiration', description: 'SKT yaklasan parti kayitlari icin uyari uretir.', cadence: 'daily', module: 'inventory', status: 'PLANNED' },
  { key: 'lot_expiration', title: 'Lot expiration', description: 'Lot/seri son kullanma tarihi uyarilarini uretir.', cadence: 'daily', module: 'inventory', status: 'PLANNED' },
  { key: 'marketplace_sync', title: 'Marketplace sync', description: 'Pazaryeri entegrasyon joblarini merkezi scheduler sistemine baglar.', cadence: 'hourly', module: 'marketplace', status: 'PLANNED' },
];

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function findJob(key: string): SchedulerJobDefinition | null {
  return JOBS.find((job) => job.key === key) ?? null;
}

export function schedulerJobDefinitions(): readonly SchedulerJobDefinition[] {
  return JOBS;
}

export class SchedulerJobEngineService {
  private readonly executions: AutomationExecutionService;

  constructor(private readonly db: SchedulerDbClient) {
    this.executions = new AutomationExecutionService(db);
  }

  async run(tenantId: string, jobKey: SchedulerJobKey | 'all', userId?: string | null): Promise<SchedulerJobEngineResult> {
    const selectedJobs = jobKey === 'all' ? JOBS.filter((job) => job.status === 'ACTIVE') : JOBS.filter((job) => job.key === jobKey);
    const items: SchedulerJobRunItem[] = [];

    for (const job of selectedJobs) {
      items.push(await this.runOne(tenantId, job, userId ?? null));
    }

    return {
      generatedAt: new Date().toISOString(),
      requestedJobKey: jobKey,
      total: items.length,
      succeeded: items.filter((item) => item.status === 'SUCCEEDED').length,
      failed: items.filter((item) => item.status === 'FAILED').length,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
      items,
    };
  }

  async recentRuns(tenantId: string, limit: number) {
    return this.db.automationExecution.findMany({
      where: {
        tenantId,
        entityType: EntityType.OTHER,
        entityId: { in: JOBS.map((job) => job.key) },
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  private async runOne(tenantId: string, job: SchedulerJobDefinition, userId: string | null): Promise<SchedulerJobRunItem> {
    const execution = await this.executions.start({
      tenantId,
      trigger: null,
      action: null,
      entityType: EntityType.OTHER,
      entityId: job.key,
      input: toJson({ scheduler: true, jobKey: job.key, cadence: job.cadence, userId }),
    });

    if (job.status === 'PLANNED') {
      const output = { status: 'SKIPPED', reason: 'Job registryde planli; calistirici henuz bagli degil.' };
      await this.executions.succeed({ tenantId, executionId: execution.id, output: toJson(output) });
      return { jobKey: job.key, status: 'SKIPPED', executionId: execution.id, matched: 0, changed: 0, message: output.reason };
    }

    try {
      const result = await this.executeActiveJob(tenantId, job.key, userId);
      await this.executions.succeed({ tenantId, executionId: execution.id, output: toJson(result) });
      return {
        jobKey: job.key,
        status: result.skipped ? 'SKIPPED' : 'SUCCEEDED',
        executionId: execution.id,
        matched: result.matched,
        changed: result.changed,
        message: result.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen scheduler hatasi.';
      await this.executions.fail({ tenantId, executionId: execution.id, error: message, output: toJson({ jobKey: job.key }) });
      return { jobKey: job.key, status: 'FAILED', executionId: execution.id, matched: 0, changed: 0, message };
    }
  }

  private async executeActiveJob(
    tenantId: string,
    jobKey: SchedulerJobKey,
    userId: string | null,
  ): Promise<{ matched: number; changed: number; skipped: boolean; message: string }> {
    switch (jobKey) {
      case 'invoice_status_recalculation': {
        const result = await scanAndRecomputeInvoiceStatuses(this.db, tenantId, { userId });
        return { matched: result.scanned, changed: result.changed, skipped: false, message: `${result.changed} fatura durumu guncellendi.` };
      }
      case 'invoice_overdue_scan': {
        const result = await this.markOverdueInvoices(tenantId);
        return { matched: result.matched, changed: result.changed, skipped: false, message: `${result.changed} fatura OVERDUE yapildi.` };
      }
      case 'reservation_cleanup': {
        const result = await this.cleanupExpiredReservations(tenantId);
        return { matched: result.matched, changed: result.changed, skipped: false, message: `${result.changed} rezervasyon serbest birakildi.` };
      }
      case 'low_stock_reorder': {
        const result = await new PurchaseAutomationService(this.db).runReorderAutomation(tenantId, userId ?? 'system');
        return { matched: result.suggestionCount, changed: result.createdRequest ? 1 : 0, skipped: !result.createdRequest, message: result.createdRequest ? `${result.createdRequest.number} olusturuldu.` : result.skippedReason ?? 'Talep olusturulmadi.' };
      }
      case 'collection_reminders': {
        const result = await new CollectionAutomationService(this.db).run(tenantId, userId);
        return { matched: result.scanned, changed: result.createdReminders + result.createdTasks + result.closedReminders, skipped: false, message: `${result.createdReminders} reminder, ${result.createdTasks} task olusturuldu.` };
      }
      case 'automation_runner': {
        const result = await AutomationRuleService.runActiveRules(tenantId);
        return { matched: result.matched, changed: result.tasksCreated + result.notificationsCreated, skipped: false, message: `${result.matched} eslesme islendi.` };
      }
      case 'bank_auto_match': {
        const result = await new BankTransactionMatchingService(this.db).autoProcess(tenantId, { minConfidence: 95, limit: 50 });
        return { matched: result.processed + result.skipped, changed: result.processed, skipped: result.processed === 0, message: `${result.processed} banka hareketi otomatik islendi.` };
      }
      case 'accounting_integrity_check': {
        const result = await new AccountingPostingEngineService(this.db).run(tenantId, { source: 'ALL', limit: 50, postImmediately: true, userId });
        return { matched: result.scanned, changed: result.posted, skipped: result.posted === 0, message: `${result.posted} muhasebe fisi uretildi.` };
      }
      case 'batch_expiration':
      case 'lot_expiration':
      case 'marketplace_sync':
        return { matched: 0, changed: 0, skipped: true, message: 'Job planli; calistirici henuz bagli degil.' };
    }
  }

  private async markOverdueInvoices(tenantId: string): Promise<{ matched: number; changed: number }> {
    const now = new Date();
    const where = {
      tenantId,
      deletedAt: null,
      type: InvoiceType.SALES,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
      dueDate: { lt: now },
    };
    const matched = await this.db.invoice.count({ where });
    const updated = await this.db.invoice.updateMany({ where, data: { status: InvoiceStatus.OVERDUE } });
    return { matched, changed: updated.count };
  }

  private async cleanupExpiredReservations(tenantId: string): Promise<{ matched: number; changed: number }> {
    const now = new Date();
    const reservations = await this.db.inventoryReservation.findMany({
      where: {
        tenantId,
        releasedAt: null,
        expiresAt: { lt: now },
      },
      select: { id: true },
      take: 500,
    });
    if (reservations.length === 0) return { matched: 0, changed: 0 };
    const ids = reservations.map((reservation) => reservation.id);
    const updated = await this.db.inventoryReservation.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { releasedAt: now },
    });
    return { matched: reservations.length, changed: updated.count };
  }
}

export function parseSchedulerJobKey(value: string | undefined): SchedulerJobKey | 'all' | null {
  if (!value || value === 'all') return 'all';
  return findJob(value)?.key ?? null;
}
