export interface DocumentTextExtractionInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface DocumentTextExtraction {
  text: string;
  provider: string;
}

export interface DocumentTextExtractorPort {
  extract(input: DocumentTextExtractionInput): Promise<DocumentTextExtraction | null>;
}
