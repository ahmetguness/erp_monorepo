import { z } from 'zod';
import { observedFetch } from '../../../shared/index.js';
import type { DocumentTextExtractorPort, DocumentTextExtractionInput } from '../../application/document-intake/document-text-extractor.port.js';

const responseSchema = z.object({ text: z.string().min(1).max(100_000), provider: z.string().min(1).max(100).optional() });

export class HttpDocumentTextExtractorAdapter implements DocumentTextExtractorPort {
  async extract(input: DocumentTextExtractionInput) {
    const endpoint = process.env.DOCUMENT_OCR_URL?.trim();
    if (!endpoint) return null;
    const response = await observedFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.DOCUMENT_OCR_TOKEN ? { authorization: `Bearer ${process.env.DOCUMENT_OCR_TOKEN}` } : {}),
      },
      body: JSON.stringify({ fileName: input.fileName, mimeType: input.mimeType, contentBase64: input.content.toString('base64') }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!response?.ok) return null;
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? { text: parsed.data.text, provider: parsed.data.provider ?? 'configured-ocr' } : null;
  }
}
