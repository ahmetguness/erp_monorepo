export const DOCUMENT_TEMPLATE_KEY = 'document_pdf_template';
export const DOCUMENT_ACCENT_KEY = 'document_pdf_accent';

export type DocumentPdfTemplate = 'classic' | 'modern' | 'compact';
export type DocumentPdfAccent = 'sky' | 'emerald' | 'slate';

export interface DocumentThemeOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

export const DOCUMENT_TEMPLATE_OPTIONS: DocumentThemeOption<DocumentPdfTemplate>[] = [
  { value: 'classic', label: 'Klasik', description: 'Logo, firma ve musteri bilgileri dengeli klasik baslikta.' },
  { value: 'modern', label: 'Modern', description: 'Renkli sol serit ve daha belirgin toplam alani.' },
  { value: 'compact', label: 'Kompakt', description: 'Daha az boslukla tek sayfaya sigmaya odakli.' },
];

export const DOCUMENT_ACCENT_OPTIONS: DocumentThemeOption<DocumentPdfAccent>[] = [
  { value: 'sky', label: 'Mavi', description: 'Satis belgeleri icin temiz mavi vurgu.' },
  { value: 'emerald', label: 'Yesil', description: 'Kucuk isletmeler icin canli ve pozitif vurgu.' },
  { value: 'slate', label: 'Sade', description: 'Az renkli, resmi ve sade belge gorunumu.' },
];

export const DEFAULT_DOCUMENT_TEMPLATE: DocumentPdfTemplate = 'classic';
export const DEFAULT_DOCUMENT_ACCENT: DocumentPdfAccent = 'sky';

export function isDocumentPdfTemplate(value: string | undefined): value is DocumentPdfTemplate {
  return value === 'classic' || value === 'modern' || value === 'compact';
}

export function isDocumentPdfAccent(value: string | undefined): value is DocumentPdfAccent {
  return value === 'sky' || value === 'emerald' || value === 'slate';
}

export function getDocumentTemplateLabel(value: string): string {
  return DOCUMENT_TEMPLATE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function getDocumentAccentLabel(value: string): string {
  return DOCUMENT_ACCENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
