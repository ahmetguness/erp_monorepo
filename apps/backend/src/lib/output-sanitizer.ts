import { AI_REDACTION_RULES } from '../services/ai/redaction-registry.js';

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

  for (const rule of AI_REDACTION_RULES) {
    if (rule.scope === 'public' && !isPublic) continue;

    const matches = result.match(rule.pattern);
    if (matches && matches.length > 0) {
      maskedCount += matches.length;
      maskedTypes.push(rule.label);
      result = result.replace(rule.pattern, rule.replacement);
    }
  }

  return { text: result, maskedCount, maskedTypes };
}
