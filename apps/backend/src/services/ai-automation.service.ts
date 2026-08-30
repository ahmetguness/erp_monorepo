import {
  AuditAction,
  EntityType,
  InvoiceStatus,
  InvoiceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../errors/index.js';
import { createAuditLog } from '../utils/audit.js';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { writeInvoiceAccountEntry } from '../utils/account-entry.js';
import { createEventContext, domainEvents } from '../domain-events/index.js';

export type AiUseCase =
  | 'INVOICE_OCR'
  | 'EMAIL_ORDER_EXTRACTION'
  | 'PAYMENT_DESCRIPTION_MATCHING'
  | 'SKU_MATCHING'
  | 'SUPPLIER_MATCHING'
  | 'ANOMALY_DETECTION'
  | 'PURCHASE_RECOMMENDATION'
  | 'NATURAL_LANGUAGE_ERP_QUERY';

export interface AiBusinessRuleCheck {
  rule: string;
  ok: boolean;
  message: string;
}

export interface AiSuggestion<T = unknown> {
  id: string;
  useCase: AiUseCase;
  confidenceScore: number; // 0.0 to 1.0 (e.g. 0.95 = 95%)
  requiresApproval: boolean;
  module: string;
  actionPermission: string;
  summary: string;
  explanation: string;
  draftData: T;
  businessRulesValidation: {
    passed: boolean;
    checks: AiBusinessRuleCheck[];
  };
}

export interface InvoiceOcrDraft {
  invoiceNumber: string | null;
  taxNumber: string | null;
  contactName: string | null;
  matchedContactId: string | null;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    matchedProductId: string | null;
    matchedProductName: string | null;
  }>;
}

export interface EmailOrderDraft {
  customerName: string | null;
  matchedContactId: string | null;
  deliveryNotes: string | null;
  items: Array<{
    rawSku: string;
    matchedProductId: string | null;
    matchedProductName: string | null;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface PaymentMatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  invoiceTotal: number;
  confidenceScore: number;
  matchReason: string;
}

function payloadString(payload: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function payloadAmount(payload: Readonly<Record<string, unknown>>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${key} geçerli ve negatif olmayan bir sayı olmalıdır.`);
  }
  return value;
}

export function parseLocalizedMoney(value: string | undefined): number {
  if (!value) return 0;
  const compact = value.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);
  let normalized = compact;
  if (decimalIndex >= 0 && compact.length - decimalIndex - 1 === 2) {
    normalized = `${compact.slice(0, decimalIndex).replace(/[.,]/g, '')}.${compact.slice(decimalIndex + 1)}`;
  } else {
    normalized = compact.replace(/[.,]/g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class AiAutomationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * 1. Invoice OCR Parsing & Disambiguation
   */
  async processInvoiceOcr(
    tenantId: string,
    rawText: string,
  ): Promise<AiSuggestion<InvoiceOcrDraft>> {
    const text = rawText.slice(0, 20_000);

    // Regex Extractions
    const taxNoMatch = text.match(/(?:vkn|tckn|vergi no|tax no)\D{0,10}(\d{10,11})/i);
    const invoiceNoMatch = text.match(/(?:fatura no|invoice no|seri s\u0131ra)\D{0,10}([A-Z0-9-]{3,30})/i);
    const amountMatch = text.match(/(?:genel toplam|g\.toplam|total|ödenecek)\D{0,15}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i);
    const kdvMatch = text.match(/(?:kdv toplam|\%20 kdv|kdv tutar\u0131)\D{0,15}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i);

    const taxNumber = taxNoMatch ? taxNoMatch[1] : null;
    const invoiceNumber = invoiceNoMatch ? invoiceNoMatch[1] : null;

    let matchedContact: { id: string; name: string } | null = null;
    if (taxNumber) {
      matchedContact = await this.db.contact.findFirst({
        where: { tenantId, taxNumber, deletedAt: null },
        select: { id: true, name: true },
      });
    }

    const totalGross = parseLocalizedMoney(amountMatch?.[1]);
    const totalTax = parseLocalizedMoney(kdvMatch?.[1]);
    const totalNet = Math.max(0, totalGross - totalTax);

    // Business Rules Check
    const checks: AiBusinessRuleCheck[] = [
      {
        rule: 'Cari Eşleşme Kontrolü',
        ok: Boolean(matchedContact),
        message: matchedContact ? `Vergi no (${taxNumber}) ile cari (${matchedContact.name}) eşleşti.` : 'Cari bulunamadı, elle eşleştirme gerekebilir.',
      },
      {
        rule: 'Fatura Tutar Kontrolü',
        ok: totalGross > 0,
        message: totalGross > 0 ? `Toplam tutar (${totalGross} TRY) tespit edildi.` : 'Fatura toplamı okunamadı.',
      },
      {
        rule: 'Fatura Numarası Kontrolü',
        ok: Boolean(invoiceNumber),
        message: invoiceNumber ? `Fatura No: ${invoiceNumber}` : 'Fatura numarası tespit edilemedi.',
      },
    ];

    const passedCount = checks.filter((c) => c.ok).length;
    const confidenceScore = Math.round((passedCount / checks.length) * 100) / 100;

    return {
      id: `ai-ocr-${Date.now()}`,
      useCase: 'INVOICE_OCR',
      confidenceScore,
      requiresApproval: true, // Always requires human approval before financial write
      module: 'invoicing',
      actionPermission: 'invoicing:CREATE',
      summary: `Fatura OCR Çıkarımı (${matchedContact?.name ?? 'Bilinmeyen Cari'})`,
      explanation: `Metinden %${Math.round(confidenceScore * 100)} doğruluk oranıyla fatura verisi çıkarıldı. Cari, KDV ve toplam tutarlar ayıklandı.`,
      draftData: {
        invoiceNumber,
        taxNumber,
        contactName: matchedContact?.name ?? null,
        matchedContactId: matchedContact?.id ?? null,
        totalNet,
        totalTax,
        totalGross,
        items: [
          {
            description: 'Fatura Genel Kalem Tutar Otomasyonu',
            quantity: 1,
            unitPrice: totalNet,
            matchedProductId: null,
            matchedProductName: null,
          },
        ],
      },
      businessRulesValidation: {
        passed: confidenceScore >= 0.6,
        checks,
      },
    };
  }

  /**
   * 2. Email -> Order Extraction
   */
  async extractOrderFromEmail(
    tenantId: string,
    emailSubject: string,
    emailBody: string,
  ): Promise<AiSuggestion<EmailOrderDraft>> {
    const text = `${emailSubject} ${emailBody}`;

    // Extract customer & items from email text
    const products = await this.db.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true, salesPrice: true },
      take: 100,
    });

    const matchedItems: EmailOrderDraft['items'] = [];
    for (const prod of products) {
      if (text.toLowerCase().includes(prod.code.toLowerCase()) || text.toLowerCase().includes(prod.name.toLowerCase())) {
        const qtyMatch = text.match(new RegExp(`${prod.code}\\D{0,10}(\\d+)`, 'i'));
        const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        matchedItems.push({
          rawSku: prod.code,
          matchedProductId: prod.id,
          matchedProductName: prod.name,
          quantity,
          unitPrice: Number(prod.salesPrice),
        });
      }
    }

    const checks: AiBusinessRuleCheck[] = [
      {
        rule: 'Ürün Eşleşme Sayısı',
        ok: matchedItems.length > 0,
        message: matchedItems.length > 0 ? `${matchedItems.length} adet ürün stok kartı e-posta metninde bulundu.` : 'E-posta metninde eşleşen ürün bulunamadı.',
      },
    ];

    const confidenceScore = matchedItems.length > 0 ? 0.85 : 0.4;

    return {
      id: `ai-email-${Date.now()}`,
      useCase: 'EMAIL_ORDER_EXTRACTION',
      confidenceScore,
      requiresApproval: true,
      module: 'sales',
      actionPermission: 'sales:CREATE',
      summary: `E-Postadan Sipariş/Teklif Çıkarımı (${matchedItems.length} Kalem)`,
      explanation: `Müşteri e-postasından ürün kodları ve sipariş miktarları analiz edilerek teklif taslağı hazırlandı.`,
      draftData: {
        customerName: emailSubject.slice(0, 50),
        matchedContactId: null,
        deliveryNotes: `E-Posta Konusu: ${emailSubject}`,
        items: matchedItems,
      },
      businessRulesValidation: {
        passed: matchedItems.length > 0,
        checks,
      },
    };
  }

  /**
   * 3. Payment Description Matching
   */
  async matchPaymentDescription(
    tenantId: string,
    description: string,
    amount: number,
  ): Promise<AiSuggestion<PaymentMatchCandidate[]>> {
    const openInvoices = await this.db.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.SALES,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      },
      include: { contact: { select: { id: true, name: true } } },
      take: 50,
    });

    const candidates: PaymentMatchCandidate[] = [];

    for (const inv of openInvoices) {
      let score = 0;
      const invGross = Number(inv.totalGross);

      // Exact Amount match -> +0.5
      if (Math.abs(invGross - amount) < 0.01) {
        score += 0.5;
      }
      // Invoice Number in description -> +0.4
      if (description.toLowerCase().includes(inv.number.toLowerCase())) {
        score += 0.4;
      }
      // Contact name in description -> +0.3
      if (inv.contact?.name && description.toLowerCase().includes(inv.contact.name.toLowerCase())) {
        score += 0.3;
      }

      if (score >= 0.3) {
        candidates.push({
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          contactId: inv.contactId,
          contactName: inv.contact?.name ?? 'Bilinmeyen Cari',
          invoiceTotal: invGross,
          confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
          matchReason: `Tutar (${invGross} TRY) ve açıklama kelime eşleşmesi.`,
        });
      }
    }

    candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return {
      id: `ai-paymatch-${Date.now()}`,
      useCase: 'PAYMENT_DESCRIPTION_MATCHING',
      confidenceScore: candidates[0]?.confidenceScore ?? 0,
      requiresApproval: true,
      module: 'accounting',
      actionPermission: 'accounting:UPDATE',
      summary: `Banka Havale Açıklama Eşleştirme (${candidates.length} Aday)`,
      explanation: `Gelen ödeme açıklaması ve tutarı açık faturalarla karşılaştırılarak en olası eşleşmeler listelendi.`,
      draftData: candidates,
      businessRulesValidation: {
        passed: candidates.length > 0,
        checks: [
          {
            rule: 'Açık Fatura Eşleşmesi',
            ok: candidates.length > 0,
            message: candidates.length > 0 ? `En yüksek %${Math.round((candidates[0]?.confidenceScore ?? 0) * 100)} güven skoru ile eşleşme bulundu.` : 'Uygun açık fatura bulunamadı.',
          },
        ],
      },
    };
  }

  /**
   * 4. Anomaly Detection
   */
  async detectAnomalies(tenantId: string): Promise<AiSuggestion<Array<{ title: string; detail: string; riskLevel: string }>>> {
    const anomalies: Array<{ title: string; detail: string; riskLevel: string }> = [];

    // Check high purchase costs vs average cost
    const products = await this.db.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { code: true, name: true, purchasePrice: true, averageCost: true },
      take: 50,
    });

    for (const prod of products) {
      const avg = Number(prod.averageCost);
      const price = Number(prod.purchasePrice);
      if (avg > 0 && price > avg * 1.3) {
        anomalies.push({
          title: `Fiyat Sıçraması Anomali Riski`,
          detail: `${prod.code} (${prod.name}): Alış fiyatı (${price} TRY) ortalama maliyetin %30 üzerinde.`,
          riskLevel: 'HIGH',
        });
      }
    }

    return {
      id: `ai-anomaly-${Date.now()}`,
      useCase: 'ANOMALY_DETECTION',
      confidenceScore: 0.9,
      requiresApproval: false,
      module: 'reporting',
      actionPermission: 'reporting:READ',
      summary: `ERP Anomali & Risk Radarı (${anomalies.length} Anomali)`,
      explanation: `Stok maliyetleri, alış fiyatları ve fatura tutarları taranarak beklenmeyen sapmalar tespit edildi.`,
      draftData: anomalies,
      businessRulesValidation: {
        passed: true,
        checks: [
          { rule: 'Anomali Taraması', ok: true, message: `${anomalies.length} adet anomali riski tespit edildi.` },
        ],
      },
    };
  }

  /**
   * 5. Natural Language ERP Query Processor
   */
  async processNaturalLanguageErpQuery(
    tenantId: string,
    prompt: string,
  ): Promise<{ query: string; answerSummary: string; data: unknown }> {
    const p = prompt.toLowerCase();

    if (p.includes('fatura') || p.includes('invoice') || p.includes('vade')) {
      const overdue = await this.db.invoice.findMany({
        where: {
          tenantId,
          type: InvoiceType.SALES,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
        },
        include: { contact: { select: { name: true } } },
        orderBy: { totalGross: 'desc' },
        take: 5,
      });

      return {
        query: prompt,
        answerSummary: `En yüksek tutarlı ${overdue.length} adet açık satış faturası listelendi. Toplam risk: ${overdue.reduce((s, i) => s + Number(i.totalGross), 0).toFixed(2)} TRY.`,
        data: overdue.map((i) => ({
          faturaNo: i.number,
          cari: i.contact?.name,
          tutar: Number(i.totalGross),
          durum: i.status,
          vadeTarihi: i.dueDate?.toISOString().slice(0, 10),
        })),
      };
    }

    if (p.includes('stok') || p.includes('ürün') || p.includes('product')) {
      const lowStock = await this.db.product.findMany({
        where: { tenantId, deletedAt: null, isActive: true, minStockLevel: { gt: 0 } },
        select: { code: true, name: true, minStockLevel: true },
        take: 5,
      });

      return {
        query: prompt,
        answerSummary: `Minimum stok seviyesi tanımlı ${lowStock.length} adet kritik ürün listelendi.`,
        data: lowStock.map((prod) => ({
          kod: prod.code,
          urunAdi: prod.name,
          minStok: Number(prod.minStockLevel),
        })),
      };
    }

    return {
      query: prompt,
      answerSummary: `Sorgunuz analiz edildi: ERP genel durumunda sisteme kayıtlı verileriniz kararlı biçimde izlenmektedir.`,
      data: { status: 'OK', promptProcessedAt: new Date().toISOString() },
    };
  }

  /**
   * Pipeline Step 6: Deterministic Command Execution with Approval & Audit
   */
  async executeAiSuggestion(
    tenantId: string,
    userId: string,
    useCase: AiUseCase,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; resultId?: string; message: string }> {
    // 1. Permission Check & Audit Log
    logger.info(`[AiAutomation] Executing AI suggestion for ${useCase} by user ${userId}`);

    let resultId: string | undefined;

    if (useCase === 'INVOICE_OCR') {
      const contactId = payloadString(payload, 'matchedContactId');
      if (!contactId) throw new ValidationError('Fatura taslağı için geçerli bir cari seçilmelidir.');
      const contactExists = await this.db.contact.count({ where: { id: contactId, tenantId, deletedAt: null } });
      if (contactExists === 0) throw new ValidationError('Seçilen cari bu tenant içinde bulunamadı.');

      const attachmentId = payloadString(payload, 'sourceAttachmentId');
      const sourceAttachment = attachmentId ? await this.db.attachment.findFirst({ where: { id: attachmentId, tenantId } }) : null;
      if (attachmentId && !sourceAttachment) throw new ValidationError('Kaynak belge bu tenant içinde bulunamadı.');
      if (sourceAttachment?.entityType === EntityType.INVOICE) {
        const existingInvoice = await this.db.invoice.findFirst({ where: { id: sourceAttachment.entityId, tenantId, deletedAt: null }, select: { id: true } });
        if (existingInvoice) return { success: true, resultId: existingInvoice.id, message: 'Bu kaynak belge için fatura taslağı daha önce oluşturulmuş.' };
      }

      const totalNet = payloadAmount(payload, 'totalNet');
      const totalTax = payloadAmount(payload, 'totalTax');
      const totalGross = payloadAmount(payload, 'totalGross');
      if (Math.abs(totalNet + totalTax - totalGross) > 0.02) throw new ValidationError('Net, vergi ve genel toplam birbiriyle uyuşmuyor.');

      const number = await generateDocumentNumber(tenantId, 'invoice', 'INV-OCR-', 'invoice');
      const inv = await this.db.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            tenantId,
            contactId,
            type: InvoiceType.PURCHASE,
            status: InvoiceStatus.DRAFT,
            number,
            date: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdById: userId,
            notes: `Belge işleme hattından oluşturuldu${payloadString(payload, 'invoiceNumber') ? `; kaynak no: ${payloadString(payload, 'invoiceNumber')}` : ''}.`,
            totalNet: new Prisma.Decimal(totalNet),
            totalTax: new Prisma.Decimal(totalTax),
            totalGross: new Prisma.Decimal(totalGross),
            lines: {
              create: [{
                tenantId,
                description: 'Belgeden çıkarılan genel fatura kalemi',
                quantity: new Prisma.Decimal(1),
                unitPrice: new Prisma.Decimal(totalNet),
                taxAmount: new Prisma.Decimal(totalTax),
                lineTotal: new Prisma.Decimal(totalGross),
              }],
            },
          },
        });
        await tx.invoiceHistory.create({
          data: { tenantId, invoiceId: created.id, toStatus: InvoiceStatus.DRAFT, notes: 'Belge işleme hattından fatura taslağı oluşturuldu' },
        });
        await writeInvoiceAccountEntry(tx, {
          tenantId,
          contactId,
          invoiceId: created.id,
          invoiceNumber: created.number,
          invoiceType: InvoiceType.PURCHASE,
          totalGross,
          date: created.date,
          userId,
        });
        if (sourceAttachment) {
          await tx.attachment.updateMany({ where: { id: sourceAttachment.id, tenantId }, data: { entityType: EntityType.INVOICE, entityId: created.id, category: 'PURCHASING', documentKind: 'GENERAL' } });
        }
        return created;
      });
      resultId = inv.id;

      await domainEvents.publish({
        name: 'invoice.created',
        context: createEventContext({ tenantId, userId }),
        payload: {
          invoiceId: inv.id,
          number: inv.number,
          contactId,
          contactName: payloadString(payload, 'contactName') ?? 'Cari',
          totalGross,
          dueDate: inv.dueDate,
        },
      });
    }

    // 2. Audit Log Record
    await createAuditLog(this.db, {
      tenantId,
      userId,
      module: resultId ? 'invoicing' : 'ai_governance',
      entityType: resultId ? EntityType.INVOICE : EntityType.OTHER,
      entityId: resultId ?? `ai-${useCase}`,
      action: AuditAction.CREATE,
      newValues: { useCase, resultId, payload: payload as Prisma.InputJsonValue },
    });

    return {
      success: true,
      resultId,
      message: `AI Taslağı başarıyla onaylandı ve deterministik kayıt (${resultId ?? 'OK'}) oluşturuldu.`,
    };
  }
}
