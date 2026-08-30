export function normalizeTaxNumber(value: string | undefined): string | null {
  const normalized = value?.replace(/\D/g, '') ?? '';
  return normalized.length === 10 || normalized.length === 11 ? normalized : null;
}

export function normalizeEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('en-US') ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function normalizePhone(value: string | undefined): string | null {
  const compact = value?.trim().replace(/[^\d+]/g, '') ?? '';
  if (compact.length < 7 || compact.length > 16) return null;
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export function normalizeBarcode(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s/g, '') ?? '';
  return /^[\dA-Za-z-]{6,32}$/.test(normalized) ? normalized : null;
}

export function generatedProductCode(barcode: string): string {
  const safe = barcode.replace(/[^\dA-Za-z]/g, '').toUpperCase();
  return `PRD-${safe.slice(-8)}`;
}

export function normalizeIban(value: string | undefined): string | null {
  const iban = value?.replace(/\s/g, '').toUpperCase() ?? '';
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  const numeric = [...rearranged].map((character) => /\d/.test(character) ? character : String(character.charCodeAt(0) - 55)).join('');
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1 ? iban : null;
}
