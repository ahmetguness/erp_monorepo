import { describe, expect, it, vi } from 'vitest';
import { DocumentIntakeService } from '../../src/modules/automation-intelligence/application/document-intake/document-intake.service.js';
import type { DocumentTextExtractorPort } from '../../src/modules/automation-intelligence/application/document-intake/document-text-extractor.port.js';
import { parseLocalizedMoney } from '../../src/services/ai-automation.service.js';

describe('DocumentIntakeService', () => {
  it('metin belgelerini dış sağlayıcıya göndermeden ve boyut sınırıyla okur', async () => {
    const extractor: DocumentTextExtractorPort = { extract: vi.fn() };
    const result = await new DocumentIntakeService(extractor).extract('invoice.txt', 'text/plain', Buffer.from('Fatura No: A-123\0'));
    expect(result).toEqual({ text: 'Fatura No: A-123', provider: 'local-text' });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('PDF ve görselleri yapılandırılmış çıkarıcıya yönlendirir', async () => {
    const extractor: DocumentTextExtractorPort = { extract: vi.fn().mockResolvedValue({ text: 'OCR sonucu', provider: 'test-ocr' }) };
    const result = await new DocumentIntakeService(extractor).extract('invoice.pdf', 'application/pdf', Buffer.from('pdf'));
    expect(result).toEqual({ text: 'OCR sonucu', provider: 'test-ocr' });
  });

  it('desteklenmeyen ikili dosyalarda güvenli biçimde sonuç üretmez', async () => {
    const extractor: DocumentTextExtractorPort = { extract: vi.fn() };
    await expect(new DocumentIntakeService(extractor).extract('archive.bin', 'application/octet-stream', Buffer.from('x'))).resolves.toBeNull();
  });
});

describe('localized invoice amounts', () => {
  it('Türkçe ve uluslararası ondalık biçimleri aynı tutara çevirir', () => {
    expect(parseLocalizedMoney('15.400,25')).toBe(15400.25);
    expect(parseLocalizedMoney('15,400.25')).toBe(15400.25);
    expect(parseLocalizedMoney('15400.25')).toBe(15400.25);
    expect(parseLocalizedMoney('15.400')).toBe(15400);
  });
});
