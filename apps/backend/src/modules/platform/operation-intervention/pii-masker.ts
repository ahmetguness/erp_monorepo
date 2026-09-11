const SENSITIVE_KEY =
  /(password|secret|token|authorization|api[-_]?key|email|phone|address|iban|tax|identity|name)/i;

function maskText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "***@***")
    .replace(/(?:\+?\d[\d\s()-]{7,}\d)/g, "***");
}

export function maskOperationPayload(value: unknown, parentKey = ""): unknown {
  if (SENSITIVE_KEY.test(parentKey) && value !== null) return "***MASKED***";
  if (typeof value === "string") return maskText(value);
  if (Array.isArray(value))
    return value.map((item) => maskOperationPayload(item, parentKey));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        maskOperationPayload(item, key),
      ]),
    );
  }
  return value;
}
