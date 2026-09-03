export interface ReportInsightPeriodInput { from: Date; to: Date }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD_MS = 366 * 86_400_000;

export function parseReportInsightPeriod(fromValue: string | undefined, toValue: string | undefined): ReportInsightPeriodInput | null {
  if (!fromValue || !toValue) return null;
  const from = new Date(DATE_ONLY.test(fromValue) ? `${fromValue}T00:00:00.000Z` : fromValue);
  const to = new Date(DATE_ONLY.test(toValue) ? `${toValue}T23:59:59.999Z` : toValue);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return null;
  if (to.getTime() - from.getTime() + 1 > MAX_PERIOD_MS) return null;
  return { from, to };
}
