export type DocumentNumericValue = number | string;

function toFiniteNumber(value: DocumentNumericValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = value.trim().replace(',', '.');
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDocumentQuantity(value: DocumentNumericValue): string {
  const quantity = toFiniteNumber(value);
  if (quantity === null) return '-';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
