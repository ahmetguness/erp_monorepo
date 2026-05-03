/**
 * AI çıktısından hassas verileri maskeler.
 *
 * privateChat = false (public chatbot): email ve telefon da maskelenir.
 * privateChat = true  (dashboard chatbot): sadece TC, IBAN, kredi kartı maskelenir.
 *   Çalışan email/telefon gibi iç veriler kendi şirket verisi olduğundan gösterilir.
 */

interface SanitizeRule { pattern: RegExp; replacement: string; label: string; publicOnly?: boolean }

const SANITIZE_RULES: SanitizeRule[] = [
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
    // publicOnly: true — sadece public chatbot'ta maskelenir
    pattern: /(?:\+90|0)\s?\(?\d{3}\)?\s?\d{3}\s?\d{2}\s?\d{2}\b/g,
    replacement: '***TEL GİZLİ***',
    label: 'Telefon',
    publicOnly: true,
  },
  {
    // Email adresleri
    // publicOnly: true — sadece public chatbot'ta maskelenir
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '***EMAIL GİZLİ***',
    label: 'Email',
    publicOnly: true,
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
 * @param text      AI yanıt metni
 * @param isPublic  true = public chatbot (tüm kurallar), false = private/dashboard (publicOnly kurallar atlanır)
 */
export function sanitizeOutput(text: string, isPublic = false): SanitizeResult {
  let result = text;
  let maskedCount = 0;
  const maskedTypes: string[] = [];

  for (const rule of SANITIZE_RULES) {
    // Private chat'te publicOnly kuralları atla
    if (rule.publicOnly && !isPublic) continue;

    const matches = result.match(rule.pattern);
    if (matches && matches.length > 0) {
      maskedCount += matches.length;
      maskedTypes.push(rule.label);
      result = result.replace(rule.pattern, rule.replacement);
    }
  }

  return { text: result, maskedCount, maskedTypes };
}
