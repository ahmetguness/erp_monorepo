import type { DocumentTextExtractorPort, DocumentTextExtraction } from './document-text-extractor.port.js';

const DIRECT_TEXT_TYPES = new Set(['text/plain', 'text/csv']);

export class DocumentIntakeService {
  constructor(private readonly extractor: DocumentTextExtractorPort) {}

  async extract(fileName: string, mimeType: string | null, content: Buffer): Promise<DocumentTextExtraction | null> {
    if (mimeType && DIRECT_TEXT_TYPES.has(mimeType)) {
      const text = content.toString('utf8').replace(/\0/g, '').trim().slice(0, 20_000);
      return text ? { text, provider: 'local-text' } : null;
    }
    if (!mimeType || (!mimeType.startsWith('image/') && mimeType !== 'application/pdf')) return null;
    const extracted = await this.extractor.extract({ fileName, mimeType, content });
    return extracted ? { ...extracted, text: extracted.text.slice(0, 20_000) } : null;
  }
}
