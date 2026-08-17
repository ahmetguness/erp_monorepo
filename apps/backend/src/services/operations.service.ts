import {
  AutomationExecutionStatus,
  DomainEventOutboxStatus,
  EDocumentStatus,
  InvoiceStatus,
  PrismaClient,
  ReservationRefType,
  SyncJobStatus,
} from '@prisma/client';
import { logger } from '../lib/logger.js';

export interface OperationsHealthSnapshot {
  generatedAt: string;
  automationHealth: {
    totalExecutions: number;
    succeededCount: number;
    failedCount: number;
    successRatePct: number;
  };
  domainEvents: {
    totalEvents: number;
    failedCount: number;
    deadLetterCount: number;
    recentFailures: Array<{ id: string; name: string; lastError: string | null; updatedAt: string }>;
  };
  failedJobs: {
    totalFailed: number;
    recentJobs: Array<{ id: string; jobType: string; errorMessage: string | null; updatedAt: string }>;
  };
  deadLetters: {
    count: number;
  };
  apiFailures: {
    recentErrorCount: number;
  };
  marketplaceSyncErrors: {
    failedCount: number;
    recentErrors: Array<{ id: string; integrationId: string; errorMessage: string | null; updatedAt: string }>;
  };
  eDocumentErrors: {
    errorCount: number;
    recentErrors: Array<{ id: string; invoiceId: string | null; documentType: string; errorMessage: string | null; updatedAt: string }>;
  };
  accountingPostingErrors: {
    unpostedInvoiceCount: number;
    recentUnposted: Array<{ id: string; number: string; totalGross: number; createdAt: string }>;
  };
}

export interface EntityTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  metadata?: Record<string, unknown>;
}

export interface EntityTimeline {
  entityType: string;
  entityId: string;
  entityCode: string;
  status: string;
  createdAt: string;
  events: EntityTimelineEvent[];
}

export class OperationsService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * 1. Fetches Operations Health Dashboard metrics
   */
  async getOperationsHealth(tenantId: string): Promise<OperationsHealthSnapshot> {
    const now = new Date();

    const [
      autoRunning,
      autoSucceeded,
      autoFailed,
      totalEvents,
      failedEventsCount,
      deadLetterEventsCount,
      recentEventFailures,
      failedJobsCount,
      recentJobs,
      failedMarketplaceJobs,
      failedEdocsCount,
      recentEdocErrors,
      unpostedInvoicesCount,
      recentUnpostedInvoices,
    ] = await this.db.$transaction([
      this.db.automationExecution.count({ where: { tenantId, status: AutomationExecutionStatus.RUNNING } }),
      this.db.automationExecution.count({ where: { tenantId, status: AutomationExecutionStatus.SUCCEEDED } }),
      this.db.automationExecution.count({ where: { tenantId, status: AutomationExecutionStatus.FAILED } }),
      this.db.domainEventOutbox.count({ where: { tenantId } }),
      this.db.domainEventOutbox.count({ where: { tenantId, status: DomainEventOutboxStatus.FAILED } }),
      this.db.domainEventOutbox.count({ where: { tenantId, status: DomainEventOutboxStatus.DEAD_LETTER } }),
      this.db.domainEventOutbox.findMany({
        where: { tenantId, status: { in: [DomainEventOutboxStatus.FAILED, DomainEventOutboxStatus.DEAD_LETTER] } },
        select: { id: true, name: true, lastError: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.db.marketplaceSyncJob.count({ where: { tenantId, status: SyncJobStatus.FAILED } }),
      this.db.marketplaceSyncJob.findMany({
        where: { tenantId, status: SyncJobStatus.FAILED },
        select: { id: true, jobType: true, errorMessage: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.db.marketplaceSyncJob.findMany({
        where: { tenantId, status: SyncJobStatus.FAILED },
        select: { id: true, integrationId: true, errorMessage: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.db.eDocument.count({
        where: { tenantId, status: { in: [EDocumentStatus.ERROR, EDocumentStatus.REJECTED] } },
      }),
      this.db.eDocument.findMany({
        where: { tenantId, status: { in: [EDocumentStatus.ERROR, EDocumentStatus.REJECTED] } },
        select: { id: true, invoiceId: true, type: true, providerMessage: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.db.invoice.count({
        where: { tenantId, deletedAt: null, status: InvoiceStatus.DRAFT },
      }),
      this.db.invoice.findMany({
        where: { tenantId, deletedAt: null, status: InvoiceStatus.DRAFT },
        select: { id: true, number: true, totalGross: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const totalAuto = autoSucceeded + autoFailed;
    const successRatePct = totalAuto > 0 ? Math.round((autoSucceeded / totalAuto) * 100) : 100;

    return {
      generatedAt: now.toISOString(),
      automationHealth: {
        totalExecutions: totalAuto,
        succeededCount: autoSucceeded,
        failedCount: autoFailed,
        successRatePct,
      },
      domainEvents: {
        totalEvents,
        failedCount: failedEventsCount,
        deadLetterCount: deadLetterEventsCount,
        recentFailures: recentEventFailures.map((e) => ({
          id: e.id,
          name: e.name,
          lastError: e.lastError,
          updatedAt: e.updatedAt.toISOString(),
        })),
      },
      failedJobs: {
        totalFailed: failedJobsCount,
        recentJobs: recentJobs.map((j) => ({
          id: j.id,
          jobType: j.jobType,
          errorMessage: j.errorMessage,
          updatedAt: j.updatedAt.toISOString(),
        })),
      },
      deadLetters: {
        count: deadLetterEventsCount,
      },
      apiFailures: {
        recentErrorCount: failedEventsCount + autoFailed,
      },
      marketplaceSyncErrors: {
        failedCount: failedJobsCount,
        recentErrors: failedMarketplaceJobs.map((j) => ({
          id: j.id,
          integrationId: j.integrationId,
          errorMessage: j.errorMessage,
          updatedAt: j.updatedAt.toISOString(),
        })),
      },
      eDocumentErrors: {
        errorCount: failedEdocsCount,
        recentErrors: recentEdocErrors.map((e) => ({
          id: e.id,
          invoiceId: e.invoiceId,
          documentType: e.type,
          errorMessage: e.providerMessage,
          updatedAt: e.updatedAt.toISOString(),
        })),
      },
      accountingPostingErrors: {
        unpostedInvoiceCount: unpostedInvoicesCount,
        recentUnposted: recentUnpostedInvoices.map((i) => ({
          id: i.id,
          number: i.number,
          totalGross: Number(i.totalGross),
          createdAt: i.createdAt.toISOString(),
        })),
      },
    };
  }

  /**
   * 2. Entity Lifecycle Timeline Engine
   * Fetches chronological events for any ERP document (SO-000154, INV-2026-001, WO-00042, etc.)
   */
  async getEntityTimeline(
    tenantId: string,
    entityType: string,
    entityIdOrCode: string,
  ): Promise<EntityTimeline> {
    const events: EntityTimelineEvent[] = [];
    const typeUpper = entityType.toUpperCase();

    let entityCode = entityIdOrCode;
    let status = 'ACTIVE';
    let createdAt = new Date().toISOString();

    // ── 1. SalesOrder Timeline ──
    if (typeUpper === 'SALES_ORDER' || typeUpper === 'SO') {
      const order = await this.db.salesOrder.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ id: entityIdOrCode }, { number: entityIdOrCode }],
        },
        include: {
          history: true,
          deliveryNotes: true,
          invoices: true,
        },
      });

      if (order) {
        entityCode = order.number;
        status = order.status;
        createdAt = order.createdAt.toISOString();

        events.push({
          id: `so-create-${order.id}`,
          timestamp: order.createdAt.toISOString(),
          title: 'Sipariş Oluşturuldu',
          description: `Satış Siparişi ${order.number} taslak olarak sisteme girildi.`,
          actor: 'Satış Ekibi',
          type: 'INFO',
        });

        for (const h of order.history) {
          events.push({
            id: `so-hist-${h.id}`,
            timestamp: h.createdAt.toISOString(),
            title: `Durum Güncellendi: ${h.fromStatus} -> ${h.toStatus}`,
            description: h.notes || `Sipariş durumu ${h.toStatus} olarak değiştirildi.`,
            actor: 'Otomasyon / Kullanıcı',
            type: h.toStatus === 'CONFIRMED' ? 'SUCCESS' : 'INFO',
          });
        }

        const reservations = await this.db.inventoryReservation.findMany({
          where: { tenantId, refType: ReservationRefType.SALES_ORDER, refId: order.id },
        });

        for (const r of reservations) {
          events.push({
            id: `so-res-${r.id}`,
            timestamp: r.reservedAt.toISOString(),
            title: 'Stok Rezerve Edildi',
            description: `${r.quantity} adet stok depodan kilitlendi (Rezervasyon ID: ${r.id}).`,
            actor: 'Stok Otomasyonu',
            type: 'SUCCESS',
          });
        }

        for (const d of order.deliveryNotes) {
          events.push({
            id: `so-del-${d.id}`,
            timestamp: d.createdAt.toISOString(),
            title: 'İrsaliye Oluşturuldu',
            description: `Teslimat irsaliyesi ${d.number} (${d.status}) hazırlandı.`,
            actor: 'Depo Sorumlusu',
            type: 'SUCCESS',
          });
        }

        for (const inv of order.invoices) {
          events.push({
            id: `so-inv-${inv.id}`,
            timestamp: inv.createdAt.toISOString(),
            title: 'Fatura Taslağı Üretildi',
            description: `Satış faturası ${inv.number} (${inv.totalGross} TRY) taslak olarak bağlandı.`,
            actor: 'Faturatör Otomasyonu',
            type: 'SUCCESS',
          });
        }
      }
    }

    // ── 2. Invoice Timeline ──
    else if (typeUpper === 'INVOICE' || typeUpper === 'INV') {
      const inv = await this.db.invoice.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ id: entityIdOrCode }, { number: entityIdOrCode }],
        },
        include: {
          history: true,
          eDocuments: true,
          payments: true,
        },
      });

      if (inv) {
        entityCode = inv.number;
        status = inv.status;
        createdAt = inv.createdAt.toISOString();

        events.push({
          id: `inv-create-${inv.id}`,
          timestamp: inv.createdAt.toISOString(),
          title: 'Fatura Oluşturuldu',
          description: `Fatura ${inv.number} (${inv.totalGross} TRY) sisteme kaydedildi.`,
          actor: 'Finans Ekibi / Otomasyon',
          type: 'INFO',
        });

        for (const h of inv.history) {
          events.push({
            id: `inv-hist-${h.id}`,
            timestamp: h.createdAt.toISOString(),
            title: `Fatura Durum Değişimi: ${h.fromStatus} -> ${h.toStatus}`,
            description: h.notes || `Fatura durumu ${h.toStatus} oldu.`,
            actor: 'Finans Otomasyonu',
            type: h.toStatus === 'PAID' ? 'SUCCESS' : 'INFO',
          });
        }

        for (const edoc of inv.eDocuments) {
          events.push({
            id: `inv-edoc-${edoc.id}`,
            timestamp: edoc.createdAt.toISOString(),
            title: `E-Belge Üretildi (${edoc.type})`,
            description: `ETTN: ${edoc.uuid ?? 'Taslak'} — Durum: ${edoc.status}`,
            actor: 'Phase 13 E-Belge Motoru',
            type: edoc.status === 'SENT' || edoc.status === 'ACCEPTED' ? 'SUCCESS' : 'WARNING',
          });
        }

        for (const alloc of inv.payments) {
          events.push({
            id: `inv-alloc-${alloc.id}`,
            timestamp: alloc.createdAt.toISOString(),
            title: 'Tahsilat / Ödeme Eşleştirildi',
            description: `${alloc.amount} TRY tutarında ödeme faturaya aktarıldı.`,
            actor: 'Banka Otomasyonu',
            type: 'SUCCESS',
          });
        }
      }
    }

    // Sort all timeline events chronologically
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      entityType: typeUpper,
      entityId: entityIdOrCode,
      entityCode,
      status,
      createdAt,
      events,
    };
  }
}
