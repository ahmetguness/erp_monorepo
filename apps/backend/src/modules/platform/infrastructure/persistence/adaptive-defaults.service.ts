import type { InvoiceType, PrismaClient } from '@prisma/client';
import { DefaultPolicyEngineService } from '../../../../services/default-policy-engine.service.js';
import { resolveCandidate } from '../../application/adaptive-defaults/adaptive-defaults.resolver.js';
import type {
  AdaptiveDefaultCandidate,
  AdaptiveDefaultField,
  AdaptiveDefaultsSnapshot,
  AdaptiveDefaultSource,
  AdaptiveDefaultSuggestion,
  AdaptiveFormKind,
  AdaptiveTransactionType,
} from '../../application/adaptive-defaults/adaptive-defaults.types.js';

interface InvoicePreferenceRow {
  contactId: string;
  createdById: string | null;
  date: Date;
  dueDate: Date | null;
  lines: Array<{ taxRateId: string | null }>;
}

function dismissalKey(userId: string, formKind: AdaptiveFormKind, field: AdaptiveDefaultField): string {
  return `adaptive-defaults.dismissed.${userId}.${formKind}.${field}`;
}

function resetKey(userId: string): string {
  return `adaptive-defaults.reset.${userId}`;
}

function countValues(values: readonly string[]): AdaptiveDefaultCandidate[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }));
}

function paymentTermDays(row: InvoicePreferenceRow): string | null {
  if (!row.dueDate) return null;
  const days = Math.round((row.dueDate.getTime() - row.date.getTime()) / 86_400_000);
  return days >= 0 && days <= 365 ? String(days) : null;
}

function valuesFor(field: AdaptiveDefaultField, rows: readonly InvoicePreferenceRow[]): string[] {
  if (field === 'paymentTermDays') return rows.map(paymentTermDays).filter((value): value is string => value !== null);
  return rows.flatMap((row) => row.lines.map((line) => line.taxRateId).filter((value): value is string => Boolean(value)));
}

export class AdaptiveDefaultsService {
  constructor(private readonly db: PrismaClient) {}

  async snapshot(tenantId: string, request: {
    userId: string;
    formKind: AdaptiveFormKind;
    transactionType: AdaptiveTransactionType;
    contactId?: string;
  }): Promise<AdaptiveDefaultsSnapshot> {
    const membership = await this.db.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId: request.userId } },
      select: { roleId: true },
    });
    const roleMembers = membership?.roleId
      ? await this.db.tenantUser.findMany({ where: { tenantId, roleId: membership.roleId, isActive: true }, select: { userId: true } })
      : [];
    const roleUserIds = new Set(roleMembers.map((member) => member.userId));
    const [rows, contact, dismissed, resetSetting] = await Promise.all([
      this.db.invoice.findMany({
        where: { tenantId, type: request.transactionType as InvoiceType, deletedAt: null },
        select: { contactId: true, createdById: true, date: true, dueDate: true, lines: { select: { taxRateId: true } } },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      request.contactId
        ? this.db.contact.findFirst({ where: { id: request.contactId, tenantId, deletedAt: null }, select: { id: true, paymentTermDays: true } })
        : null,
      this.db.tenantSetting.findMany({
        where: { tenantId, key: { startsWith: `adaptive-defaults.dismissed.${request.userId}.${request.formKind}.` } },
        select: { key: true },
      }),
      this.db.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: resetKey(request.userId) } },
        select: { value: true },
      }),
    ]);
    const resetAt = resetSetting ? new Date(resetSetting.value) : null;
    const usableRows = resetAt && !Number.isNaN(resetAt.getTime()) ? rows.filter((row) => row.date > resetAt) : rows;
    const dismissedKeys = new Set(dismissed.map((setting) => setting.key));
    const suggestions: AdaptiveDefaultSuggestion[] = [];

    for (const field of ['paymentTermDays', 'taxRateId'] as const) {
      if (dismissedKeys.has(dismissalKey(request.userId, request.formKind, field))) continue;
      const deterministic = field === 'paymentTermDays' && contact?.paymentTermDays !== null && contact?.paymentTermDays !== undefined
        ? this.deterministicContactTerm(contact.paymentTermDays)
        : null;
      const learned = deterministic ?? await this.resolveLearned(field, usableRows, request.userId, roleUserIds, request.contactId, tenantId);
      if (learned) suggestions.push(learned);
    }

    return {
      formKind: request.formKind,
      transactionType: request.transactionType,
      contactId: request.contactId ?? null,
      suggestions,
      generatedAt: new Date().toISOString(),
    };
  }

  async dismiss(tenantId: string, userId: string, formKind: AdaptiveFormKind, field: AdaptiveDefaultField): Promise<void> {
    const key = dismissalKey(userId, formKind, field);
    await this.db.tenantSetting.upsert({ where: { tenantId_key: { tenantId, key } }, create: { tenantId, key, value: 'true' }, update: { value: 'true' } });
  }

  async reset(tenantId: string, userId: string): Promise<number> {
    const result = await this.db.$transaction(async (tx) => {
      const deleted = await tx.tenantSetting.deleteMany({ where: { tenantId, key: { startsWith: `adaptive-defaults.dismissed.${userId}.` } } });
      const key = resetKey(userId);
      await tx.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
      return deleted.count;
    });
    return result;
  }

  private deterministicContactTerm(days: number): AdaptiveDefaultSuggestion {
    return { field: 'paymentTermDays', value: String(days), confidence: 1, sampleSize: 1, source: 'contact', reason: 'Cari kartındaki kesin vade bilgisi.', autoApplicable: true };
  }

  private async resolveLearned(
    field: AdaptiveDefaultField,
    rows: readonly InvoicePreferenceRow[],
    userId: string,
    roleUserIds: ReadonlySet<string>,
    contactId: string | undefined,
    tenantId: string,
  ): Promise<AdaptiveDefaultSuggestion | null> {
    const cohorts: Array<{ source: AdaptiveDefaultSource; rows: readonly InvoicePreferenceRow[] }> = [
      { source: 'contact', rows: contactId ? rows.filter((row) => row.contactId === contactId) : [] },
      { source: 'user', rows: rows.filter((row) => row.createdById === userId) },
      { source: 'role', rows: rows.filter((row) => row.createdById !== null && roleUserIds.has(row.createdById)) },
      { source: 'tenant', rows },
    ];
    for (const cohort of cohorts) {
      const suggestion = resolveCandidate(field, cohort.source, countValues(valuesFor(field, cohort.rows)));
      if (suggestion) return suggestion;
    }
    return this.resolvePolicy(field, tenantId);
  }

  private async resolvePolicy(field: AdaptiveDefaultField, tenantId: string): Promise<AdaptiveDefaultSuggestion | null> {
    const policyKey = field === 'paymentTermDays' ? 'defaults.tenant.defaultPaymentTerm' : 'defaults.tenant.defaultTaxRate';
    const value = await new DefaultPolicyEngineService(this.db).resolve(tenantId, policyKey);
    if (!value) return null;
    if (field === 'paymentTermDays') return resolveCandidate(field, 'policy', [{ value, count: 1 }]);
    const rate = Number(value);
    if (!Number.isFinite(rate)) return null;
    const taxRate = await this.db.taxRate.findFirst({ where: { tenantId, rate, isWithholding: false, isActive: true }, select: { id: true } });
    return taxRate ? resolveCandidate(field, 'policy', [{ value: taxRate.id, count: 1 }]) : null;
  }
}
