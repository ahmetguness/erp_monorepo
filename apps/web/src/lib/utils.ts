// ─────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────

// Tailwind class merger
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────
// Currency formatting
// ─────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency = 'TRY',
  locale = 'tr-TR',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ─────────────────────────────────────────────
// Date formatting
// ─────────────────────────────────────────────

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

// ISO date string for input[type=date]
export function toInputDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
}

export function todayInputDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ─────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}
