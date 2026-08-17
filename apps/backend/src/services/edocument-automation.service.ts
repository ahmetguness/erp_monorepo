import { randomUUID } from 'crypto';
import {
  EDocumentStatus,
  EDocumentType,
  InvoiceStatus,
  PrismaClient,
  Prisma,
} from '@prisma/client';
import { logger } from '../lib/logger.js';

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
   * Pipeline Step 1: Invoice Approved / Sent -> EDocument Create & Send to Provider
   */
  async autoCreateAndSendEDocument(tenantId: string, invoiceId: string): Promise<{ id: string; uuid: string; status: EDocumentStatus }> {
    const invoice = await this.db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        contact: selectContactFields(),
        eDocuments: true,
      },
    });

    if (!invoice) {
      throw new Error(`Fatura bulunamadı: ${invoiceId}`);
    }

    // Check if an EDocument already exists for this invoice
    const existing = invoice.eDocuments[0];
    if (existing) {
      return { id: existing.id, uuid: existing.uuid ?? '', status: existing.status };
    }

    // Determine E-Document Type based on Contact Tax Information
    const isEInvoiceContact = Boolean(
      invoice.contact?.taxNumber &&
      invoice.contact.taxNumber.length >= 10 &&
      !invoice.contact.notes?.includes('E_ARCHIVE_ONLY')
    );

    const type = isEInvoiceContact ? EDocumentType.E_INVOICE : EDocumentType.E_ARCHIVE;
    const uuid = randomUUID();
    const providerCode = `GIB-${type}-${uuid.slice(0, 8).toUpperCase()}`;

    const doc = await this.db.eDocument.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        type,
        uuid,
        providerCode,
        status: EDocumentStatus.PROCESSING,
        requestPayload: {
          invoiceNumber: invoice.number,
          totalGross: Number(invoice.totalGross),
          contactName: invoice.contact?.name,
          taxNumber: invoice.contact?.taxNumber,
          issueDate: invoice.date.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    // Simulate / Dispatch to Provider Integration
    try {
      await this.dispatchToProvider(tenantId, doc.id, providerCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[EDocumentAutomation] Provider dispatch error for doc ${doc.id}: ${msg}`);
      await this.db.eDocument.update({
        where: { id: doc.id },
        data: {
          status: EDocumentStatus.ERROR,
          providerMessage: `Sağlayıcı iletişim hatası: ${msg}`,
        },
      });
    }

    return { id: doc.id, uuid, status: doc.status };
  }

  /**
   * Pipeline Step 2: Single Source of Truth — Handle Provider Callback / Webhook
   * Only provider callbacks can mark EDocument as ACCEPTED or REJECTED
   */
  async processProviderCallback(
    tenantId: string,
    edocumentId: string,
    payload: ProviderCallbackPayload,
  ): Promise<{ edocumentId: string; status: EDocumentStatus; invoiceUpdated: boolean }> {
    const doc = await this.db.eDocument.findFirst({
      where: { id: edocumentId, tenantId },
      include: { invoice: true },
    });

    if (!doc) {
      throw new Error(`E-Belge bulunamadı: ${edocumentId}`);
    }

    const newStatus = payload.status;
    let invoiceUpdated = false;

    const dateData: Record<string, Date> = {};
    if (newStatus === EDocumentStatus.ACCEPTED) {
      dateData.acceptedAt = new Date();
    } else if (newStatus === EDocumentStatus.REJECTED) {
      dateData.rejectedAt = new Date();
    } else if (newStatus === EDocumentStatus.SENT) {
      dateData.sentAt = new Date();
    }

    const responsePayloadValue: Prisma.InputJsonValue | undefined = payload.responsePayload
      ? (payload.responsePayload as Prisma.InputJsonValue)
      : doc.responsePayload ? (doc.responsePayload as Prisma.InputJsonValue) : undefined;

    await this.db.eDocument.update({
      where: { id: doc.id },
      data: {
        status: newStatus,
        providerMessage: payload.message ?? doc.providerMessage,
        providerCode: payload.providerCode ?? doc.providerCode,
        ...(responsePayloadValue !== undefined && { responsePayload: responsePayloadValue }),
        ...dateData,
      },
    });

    // If ACCEPTED -> Update Invoice Status to SENT
    if (newStatus === EDocumentStatus.ACCEPTED && doc.invoiceId) {
      await this.db.invoice.update({
        where: { id: doc.invoiceId },
        data: {
          status: InvoiceStatus.SENT,
        },
      });
      invoiceUpdated = true;
    }

    logger.info(`[EDocumentAutomation] Processed provider callback for ${doc.id}: ${newStatus}`);
    return { edocumentId: doc.id, status: newStatus, invoiceUpdated };
  }

  /**
   * Exception Center: List Rejected or Errored E-Documents
   */
  async getExceptionSummary(tenantId: string): Promise<EDocumentExceptionItem[]> {
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
      orderBy: { updatedAt: 'desc' },
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
  async retryEDocument(tenantId: string, edocumentId: string): Promise<{ id: string; status: EDocumentStatus }> {
    const doc = await this.db.eDocument.findFirst({
      where: { id: edocumentId, tenantId },
    });

    if (!doc) throw new Error(`E-Belge bulunamadı: ${edocumentId}`);

    const updated = await this.db.eDocument.update({
      where: { id: doc.id },
      data: {
        status: EDocumentStatus.PROCESSING,
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
        providerMessage: 'Yeniden gönderiliyor...',
      },
    });

    try {
      await this.dispatchToProvider(tenantId, doc.id, doc.providerCode ?? `GIB-RETRY-${doc.id.slice(0, 8)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.eDocument.update({
        where: { id: doc.id },
        data: {
          status: EDocumentStatus.ERROR,
          providerMessage: `Yeniden deneme hatası: ${msg}`,
        },
      });
    }

    return { id: updated.id, status: EDocumentStatus.PROCESSING };
  }

  // ── Helper ────────────────────────────────────

  private async dispatchToProvider(tenantId: string, edocumentId: string, providerCode: string): Promise<void> {
    setTimeout(async () => {
      try {
        const doc = await this.db.eDocument.findFirst({ where: { id: edocumentId, tenantId } });
        if (!doc) return;

        const isSuccess = !doc.providerMessage?.includes('FORCE_FAIL');
        const status = isSuccess ? EDocumentStatus.ACCEPTED : EDocumentStatus.REJECTED;
        const message = isSuccess
          ? 'GİB tarafından başarıyla onaylandı.'
          : 'GİB Hata 1150: Şema doğrulama hatası.';

        await this.processProviderCallback(tenantId, edocumentId, {
          status,
          providerCode,
          message,
          responsePayload: { gibResponseCode: isSuccess ? '200' : '1150', isSuccess },
        });
      } catch (err) {
        logger.error(`[EDocumentAutomation] Async provider callback simulation error: ${err}`);
      }
    }, 1000);
  }
}

function selectContactFields() {
  return {
    select: {
      id: true,
      name: true,
      taxNumber: true,
      notes: true,
    },
  };
}
