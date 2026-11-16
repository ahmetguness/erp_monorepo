import { enqueueDomainEvent } from '../domain-events/outbox.js';
import { createEventContext } from '../domain-events/events.js';
import { PermanentDeliveryError } from '../domain-events/delivery/retry-policy.js';
import {
  EDocumentStatus,
  EDocumentType,
  InvoiceStatus,
  PrismaClient,
  Prisma,
} from "@prisma/client";
import { logger } from "../lib/logger.js";
import { ValidationError } from "../errors/index.js";

export interface ProviderCallbackPayload {
  status: EDocumentStatus;
  providerCode?: string;
  gibStatusCode?: string;
  message?: string;
  responsePayload?: unknown;
}

export interface EDocumentExceptionItem {
  id: string;
  type: EDocumentType;
  status: EDocumentStatus;
  uuid: string | null;
  providerCode: string | null;
  providerMessage: string | null;
  retryCount: number;
  lastRetryAt: Date | null;
  createdAt: Date;
  invoice: {
    id: string;
    number: string;
    contactName?: string;
    totalGross?: number;
  } | null;
  deliveryNote: {
    id: string;
    number: string;
  } | null;
}

export class EDocumentAutomationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Pipeline Step 2: Single Source of Truth — Handle Provider Callback / Webhook
   * Only provider callbacks can mark EDocument as ACCEPTED or REJECTED
   */
  async processProviderCallback(
    tenantId: string,
    edocumentId: string,
    payload: ProviderCallbackPayload,
  ): Promise<{
    edocumentId: string;
    status: EDocumentStatus;
    invoiceUpdated: boolean;
  }> {
    const doc = await this.db.eDocument.findFirst({
      where: { id: edocumentId, tenantId },
      include: { invoice: true },
    });

    if (!doc) {
      throw new Error(`E-Belge bulunamadı: ${edocumentId}`);
    }

    const newStatus = payload.status;
    if (doc.status === newStatus) return { edocumentId: doc.id, status: newStatus, invoiceUpdated: false };
    const providerTransitions: Partial<
      Record<EDocumentStatus, EDocumentStatus[]>
    > = {
      [EDocumentStatus.PENDING]: [
        EDocumentStatus.PROCESSING,
        EDocumentStatus.SENT,
        EDocumentStatus.ACCEPTED,
        EDocumentStatus.REJECTED,
        EDocumentStatus.ERROR,
      ],
      [EDocumentStatus.PROCESSING]: [
        EDocumentStatus.SENT,
        EDocumentStatus.ACCEPTED,
        EDocumentStatus.REJECTED,
        EDocumentStatus.ERROR,
      ],
      [EDocumentStatus.SENT]: [
        EDocumentStatus.ACCEPTED,
        EDocumentStatus.REJECTED,
        EDocumentStatus.ERROR,
      ],
    };
    if (!(providerTransitions[doc.status] ?? []).includes(newStatus)) {
      throw new ValidationError(
        `${doc.status} durumundan ${newStatus} provider gecisi gecersizdir.`,
      );
    }
    let invoiceUpdated = false;

    const dateData: Record<string, Date> = {};
    if (newStatus === EDocumentStatus.ACCEPTED) {
      dateData.acceptedAt = new Date();
    } else if (newStatus === EDocumentStatus.REJECTED) {
      dateData.rejectedAt = new Date();
    } else if (newStatus === EDocumentStatus.SENT) {
      dateData.sentAt = new Date();
    }

    const responsePayloadValue: Prisma.InputJsonValue | undefined =
      payload.responsePayload
        ? (payload.responsePayload as Prisma.InputJsonValue)
        : doc.responsePayload
          ? (doc.responsePayload as Prisma.InputJsonValue)
          : undefined;

    await this.db.$transaction(async (tx) => {
      const claimed = await tx.eDocument.updateMany({
        where: { id: doc.id, tenantId, status: doc.status },
        data: {
          status: newStatus,
          providerMessage: payload.message ?? doc.providerMessage,
          providerCode: payload.providerCode ?? doc.providerCode,
          ...(responsePayloadValue !== undefined && {
            responsePayload: responsePayloadValue,
          }),
          ...dateData,
        },
      });
      if (claimed.count !== 1)
        throw new ValidationError("E-belge durumu es zamanli olarak degisti.");

      if (newStatus === EDocumentStatus.ACCEPTED && doc.invoiceId) {
        const updated = await tx.invoice.updateMany({
          where: { id: doc.invoiceId, tenantId, status: InvoiceStatus.DRAFT },
          data: { status: InvoiceStatus.SENT },
        });
        invoiceUpdated = updated.count === 1;
      }
    });

    logger.info(
      `[EDocumentAutomation] Processed provider callback for ${doc.id}: ${newStatus}`,
    );
    return { edocumentId: doc.id, status: newStatus, invoiceUpdated };
  }

  /**
   * Exception Center: List Rejected or Errored E-Documents
   */
  async getExceptionSummary(
    tenantId: string,
  ): Promise<EDocumentExceptionItem[]> {
    const docs = await this.db.eDocument.findMany({
      where: {
        tenantId,
        status: { in: [EDocumentStatus.REJECTED, EDocumentStatus.ERROR] },
      },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            totalGross: true,
            contact: { select: { name: true } },
          },
        },
        deliveryNote: {
          select: { id: true, number: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return docs.map((doc) => ({
      id: doc.id,
      type: doc.type,
      status: doc.status,
      uuid: doc.uuid,
      providerCode: doc.providerCode,
      providerMessage: doc.providerMessage,
      retryCount: doc.retryCount,
      lastRetryAt: doc.lastRetryAt,
      createdAt: doc.createdAt,
      invoice: doc.invoice
        ? {
            id: doc.invoice.id,
            number: doc.invoice.number,
            contactName: doc.invoice.contact?.name,
            totalGross: Number(doc.invoice.totalGross),
          }
        : null,
      deliveryNote: doc.deliveryNote,
    }));
  }

  /**
   * Exception Center Action: Retry Failed E-Document Dispatch
   */
  async retryEDocument(
    tenantId: string,
    edocumentId: string,
  ): Promise<{ id: string; status: EDocumentStatus }> {
    const doc = await this.db.eDocument.findFirst({
      where: { id: edocumentId, tenantId },
    });

    if (!doc) throw new Error(`E-Belge bulunamadı: ${edocumentId}`);

    if (
      doc.status !== EDocumentStatus.ERROR &&
      doc.status !== EDocumentStatus.REJECTED
    ) {
      throw new ValidationError(
        "Yalnizca ERROR veya REJECTED durumundaki e-belgeler yeniden denenebilir.",
      );
    }

    return this.db.$transaction(async (tx) => {
      const changed = await tx.eDocument.updateMany({
        where: { id: doc.id, tenantId, status: doc.status, retryCount: doc.retryCount },
        data: { status: EDocumentStatus.PROCESSING, retryCount: { increment: 1 }, lastRetryAt: new Date() },
      });
      if (!changed.count) throw new ValidationError('E-document changed concurrently.');
      await enqueueDomainEvent(tx, {
        name: 'edocument.delivery.requested', context: createEventContext({ tenantId }),
        payload: { edocumentId: doc.id, retry: doc.retryCount + 1 }
      });
      return { id: doc.id, status: EDocumentStatus.PROCESSING };
    });
  }

  /** The existing mock adapter is durable now; a real provider must implement its own idempotent protocol. */
  async deliverQueuedDocument(tenantId: string, edocumentId: string): Promise<void> {
    const doc = await this.db.eDocument.findFirstOrThrow({ where: { id: edocumentId, tenantId }, include: { invoice: { select: { status: true } } } });
    if (doc.status === EDocumentStatus.ACCEPTED || doc.status === EDocumentStatus.REJECTED) return;
    if (doc.invoice?.status === InvoiceStatus.CANCELLED) {
      await this.db.eDocument.updateMany({ where: { id: doc.id, tenantId, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'ERROR', providerMessage: 'Source invoice was cancelled before delivery.' } });
      throw new PermanentDeliveryError('Source invoice was cancelled before delivery.');
    }
    if (process.env.NODE_ENV === 'production' && process.env.EDOCUMENT_PROVIDER_MODE !== 'mock') {
      await this.db.eDocument.updateMany({
        where: { id: doc.id, tenantId, status: 'PROCESSING' },
        data: { status: 'ERROR', providerMessage: 'E-document provider is not configured.' }
      });
      throw new PermanentDeliveryError('E-document provider is not configured.');
    }
    const accepted = !doc.providerMessage?.includes('FORCE_FAIL');
    await this.processProviderCallback(tenantId, doc.id, {
      status: accepted ? EDocumentStatus.ACCEPTED : EDocumentStatus.REJECTED,
      providerCode: doc.providerCode ?? undefined,
      message: accepted ? 'Mock provider accepted the document.' : 'Mock provider rejected the document.',
      responsePayload: { isSuccess: accepted, gibResponseCode: accepted ? '200' : '1150' },
    });
  }

}
