import { EntityType, type PrismaClient } from '@prisma/client';
import type { ObjectStorage } from '../../../shared/index.js';
import type { AiAutomationService } from '../../../../services/ai-automation.service.js';
import { DocumentIntakeService } from '../../application/document-intake/index.js';
import type { DocumentTextExtractorPort } from '../../application/document-intake/document-text-extractor.port.js';

export class DocumentDraftService {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: ObjectStorage,
    private readonly extractor: DocumentTextExtractorPort,
    private readonly automation: AiAutomationService,
  ) {}

  async get(tenantId: string, attachmentId: string) {
    const attachment = await this.db.attachment.findFirst({
      where: { id: attachmentId, tenantId },
      select: { id: true, fileName: true, mimeType: true, storagePath: true, entityType: true, entityId: true },
    });
    if (!attachment) return null;
    const stored = await this.storage.get(attachment.storagePath);
    if (!stored) return null;
    const extraction = await new DocumentIntakeService(this.extractor).extract(attachment.fileName, attachment.mimeType, stored.body);
    if (!extraction) return {
      attachment: { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType },
      status: 'PROVIDER_REQUIRED' as const,
      providerRequired: true as const,
      message: 'PDF ve görseller için DOCUMENT_OCR_URL ile bir OCR sağlayıcısı yapılandırın. Metin/CSV belgeler yerel olarak okunur.',
    };
    const extractedSuggestion = await this.automation.processInvoiceOcr(tenantId, extraction.text);
    const linkedContact = !extractedSuggestion.draftData.matchedContactId && attachment.entityType === EntityType.CONTACT
      ? await this.db.contact.findFirst({ where: { id: attachment.entityId, tenantId, deletedAt: null }, select: { id: true, name: true } })
      : null;
    const checks = linkedContact
      ? [
          { rule: 'Cari Eşleşme Kontrolü', ok: true, message: `Belgenin bağlı olduğu cari (${linkedContact.name}) kullanıldı.` },
          ...extractedSuggestion.businessRulesValidation.checks.slice(1),
        ]
      : extractedSuggestion.businessRulesValidation.checks;
    const confidenceScore = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100) / 100;
    const suggestion = {
      ...extractedSuggestion,
      confidenceScore,
      draftData: linkedContact
        ? { ...extractedSuggestion.draftData, matchedContactId: linkedContact.id, contactName: linkedContact.name }
        : extractedSuggestion.draftData,
      businessRulesValidation: { passed: confidenceScore >= 0.6, checks },
    };
    const sourceNumber = suggestion.draftData.invoiceNumber;
    const possibleDuplicate = sourceNumber
      ? await this.db.invoice.findFirst({ where: { tenantId, deletedAt: null, notes: { contains: `kaynak no: ${sourceNumber}`, mode: 'insensitive' } }, select: { id: true, number: true } })
      : null;
    return {
      attachment: { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType },
      status: 'DRAFT_READY' as const,
      providerRequired: false as const,
      provider: extraction.provider,
      suggestion: { ...suggestion, draftData: { ...suggestion.draftData, sourceAttachmentId: attachment.id } },
      possibleDuplicate,
      lowConfidenceFields: suggestion.businessRulesValidation.checks.filter((check) => !check.ok).map((check) => check.rule),
      previewText: extraction.text.slice(0, 800),
    };
  }
}
