const SECRET_KEY =
  /(authorization|cookie|password|secret|token|api[-_]?key|otp|(^|_)code($|_)|(?:verification|recovery|backup|mfa|access).?code|dsn)/i;
const PERSONAL_KEY =
  /(email|phone|address|iban|tax.?number|identity.?number|salary|wage|balance|amount|card.?number|account.?number|request.?body|response.?body|prompt|completion|^(?:name)$|(?:user|customer|employee|person|contact|company|supplier).?name)/i;
export function redactSensitiveText(value: string): string {
  return value
    .slice(0, 4096)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/((?:https?|postgres(?:ql)?|rediss?):\/\/)[^\s/@:]*:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:[a-f0-9]{64}|[a-f0-9]{32})\b/gi, '[REDACTED]')
    .replace(/([?&](?:X-Amz-(?:Signature|Credential|Security-Token)|token|api_key|signature)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED]",
    )
    .replace(
      /\b(password|secret|token|authorization|api[-_]?key|apiSecret|otp|dsn)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "***@***")
    .replace(
      /(?<![A-Za-z0-9-])(?:\+?\d[\d\s()-]{7,}\d)(?![A-Za-z0-9-])/g,
      "***",
    );
}
export function redactSensitiveValue(value: unknown, key = "", depth = 0): unknown {
  if ((SECRET_KEY.test(key) || PERSONAL_KEY.test(key)) && value !== null)
    return "[REDACTED]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (depth >= 6) return '[REDACTED]';
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => redactSensitiveValue(item, key, depth + 1));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).slice(0, 50).map(([childKey, item]) => [
        childKey,
        redactSensitiveValue(item, childKey, depth + 1),
      ]),
    );
  return value;
}
