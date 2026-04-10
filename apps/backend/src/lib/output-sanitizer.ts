/**
 * AI çıktısından hassas verileri maskeler.
 * TC kimlik, IBAN, kredi kartı, telefon numarası vb.
 */

const SANITIZE_RULES: { pattern: RegExp; replacement: string; label: string }[] = [
  {
    // TC Kimlik No: 11 haneli, başı 0 olmayan
    pattern: /\b[1-9]\d{10}\b/g,
    replacement: '***TC GİZLİ***',
    label: 'TC Kimlik',
  },
  {
    // IBAN: TR + 24 hane
    pattern: /\bTR\s?\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi,
    replacement: '***IBAN GİZLİ***',
    label: 'IBAN',
  },
  {
    // Kredi kartı: 16 hane (boşluklu veya boşluksuz)
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '***KART GİZLİ***',
    label: 'Kredi Kartı',
  },
  {
    // Telefon: +90 veya 0 ile başlayan 10-11 hane
    pattern: /(?:\+90|0)\s?\(?\d{3}\)?\s?\d{3}\s?\d{2}\s?\d{2}\b/g,
    replacement: '***TEL GİZLİ***',
    label: 'Telefon',
  },
  {
    // Email adresleri
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '***EMAIL GİZLİ***',
    label: 'Email',
  },
  {
    // Vergi No: 10 haneli
    pattern: /\bV\.?D\.?\s*:?\s*\d{10}\b/gi,
    replacement: '***VERGİ NO GİZLİ***',
    label: 'Vergi No',
  },
];

export interface SanitizeResult {
  text: string;
  maskedCount: number;
  maskedTypes: string[];
}

/**
 * Metindeki hassas verileri maskeler.
 * AI yanıtı client'a gönderilmeden önce çağrılmalı.
 */
export function sanitizeOutput(text: string): SanitizeResult {
  let result = text;
  let maskedCount = 0;
  const maskedTypes: string[] = [];

  for (const rule of SANITIZE_RULES) {
    const matches = result.match(rule.pattern);
    if (matches && matches.length > 0) {
      maskedCount += matches.length;
      maskedTypes.push(rule.label);
      result = result.replace(rule.pattern, rule.replacement);
    }
  }

  return { text: result, maskedCount, maskedTypes };
}
