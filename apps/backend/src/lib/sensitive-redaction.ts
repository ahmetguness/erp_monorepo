const SECRET_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|otp|code|dsn)/i;
const PERSONAL_KEY = /(^|_)(email|phone|address|iban|taxNumber|identityNumber)($|_)/i;
export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(password|secret|token|authorization|api[-_]?key|apiSecret|otp|dsn)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "***@***")
    .replace(/(?<![A-Za-z0-9-])(?:\+?\d[\d\s()-]{7,}\d)(?![A-Za-z0-9-])/g, "***")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]");
}
export function redactSensitiveValue(value: unknown, key = ""): unknown {
  if ((SECRET_KEY.test(key) || PERSONAL_KEY.test(key)) && value !== null) return "[REDACTED]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, key));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactSensitiveValue(item, childKey)]));
  return value;
}
