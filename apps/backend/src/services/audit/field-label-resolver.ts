import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { AuditFieldValueLabels } from './types.js';
import { isJsonObject } from './field-value-formatter.js';

// ─────────────────────────────────────────────
// Audit Field Label Resolver
// ID alanlarını iş dili isimlerine çevirir.
// Örn: contactId → "ABC Ltd." (code - name)
// ─────────────────────────────────────────────

interface AuditFieldLabelSource {
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  userId: string | null;
}

function collectFieldStringValuesFromObject(
  json: Prisma.JsonObject,
  field: string,
  values: Set<string>,
): void {
  for (const [key, value] of Object.entries(json)) {
    if (value === null || value === undefined) continue;
    if (key === field && typeof value === 'string' && value.trim()) {
      values.add(value);
      continue;
    }
    if (isJsonObject(value)) {
      collectFieldStringValuesFromObject(value, field, values);
    }
  }
}

function collectFieldStringValues(
  logs: readonly AuditFieldLabelSource[],
  field: string,
): string[] {
  const values = new Set<string>();
  for (const log of logs) {
    for (const json of [log.oldValues, log.newValues]) {
      if (isJsonObject(json)) collectFieldStringValuesFromObject(json, field, values);
    }
  }
  return Array.from(values);
}

function collectUserIds(logs: readonly AuditFieldLabelSource[]): string[] {
  return Array.from(
    new Set(logs.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))),
  );
}

function makeFieldMap(entries: Array<{ id: string; label: string }>): ReadonlyMap<string, string> {
  return new Map(entries.map((entry) => [entry.id, entry.label]));
}

/**
 * Audit log kayıtlarındaki ID alanlarını iş dili isimlerine dönüştürür.
 * Tüm referans alanları tek sorguda toplu çözümlenir.
 */
export async function resolveAuditFieldValueLabels(
  db: PrismaClient,
  tenantId: string,
  logs: readonly AuditFieldLabelSource[],
): Promise<AuditFieldValueLabels> {
  const labels = new Map<string, ReadonlyMap<string, string>>();

  // ── contactId ────────────────────────────────
  const contactIds = collectFieldStringValues(logs, 'contactId');
  if (contactIds.length > 0) {
    const contacts = await db.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true, code: true, name: true },
    });
    labels.set(
      'contactId',
      makeFieldMap(
        contacts.map((c) => ({ id: c.id, label: c.code ? `${c.code} - ${c.name}` : c.name })),
      ),
    );
  }

  // ── productId ────────────────────────────────
  const productIds = collectFieldStringValues(logs, 'productId');
  if (productIds.length > 0) {
    const products = await db.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, code: true, name: true },
    });
    labels.set(
      'productId',
      makeFieldMap(products.map((p) => ({ id: p.id, label: `${p.code} - ${p.name}` }))),
    );
  }

  // ── warehouseId ──────────────────────────────
  const warehouseIds = collectFieldStringValues(logs, 'warehouseId');
  if (warehouseIds.length > 0) {
    const warehouses = await db.warehouse.findMany({
      where: { tenantId, id: { in: warehouseIds } },
      select: { id: true, code: true, name: true },
    });
    labels.set(
      'warehouseId',
      makeFieldMap(warehouses.map((w) => ({ id: w.id, label: `${w.code} - ${w.name}` }))),
    );
  }

  // ── categoryId ───────────────────────────────
  const categoryIds = collectFieldStringValues(logs, 'categoryId');
  if (categoryIds.length > 0) {
    const categories = await db.category.findMany({
      where: { tenantId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    labels.set('categoryId', makeFieldMap(categories.map((cat) => ({ id: cat.id, label: cat.name }))));
  }

  // ── taxRateId ────────────────────────────────
  const taxRateIds = collectFieldStringValues(logs, 'taxRateId');
  if (taxRateIds.length > 0) {
    const taxRates = await db.taxRate.findMany({
      where: { tenantId, id: { in: taxRateIds } },
      select: { id: true, name: true, rate: true },
    });
    labels.set(
      'taxRateId',
      makeFieldMap(taxRates.map((t) => ({ id: t.id, label: `${t.name} (%${t.rate})` }))),
    );
  }

  // ── bankAccountId ────────────────────────────
  const bankAccountIds = collectFieldStringValues(logs, 'bankAccountId');
  if (bankAccountIds.length > 0) {
    const bankAccounts = await db.bankAccount.findMany({
      where: { tenantId, id: { in: bankAccountIds } },
      select: { id: true, name: true },
    });
    labels.set('bankAccountId', makeFieldMap(bankAccounts.map((b) => ({ id: b.id, label: b.name }))));
  }

  // ── cashAccountId ────────────────────────────
  const cashAccountIds = collectFieldStringValues(logs, 'cashAccountId');
  if (cashAccountIds.length > 0) {
    const cashAccounts = await db.cashAccount.findMany({
      where: { tenantId, id: { in: cashAccountIds } },
      select: { id: true, name: true },
    });
    labels.set('cashAccountId', makeFieldMap(cashAccounts.map((c) => ({ id: c.id, label: c.name }))));
  }

  // ── roleId ───────────────────────────────────
  const roleIds = collectFieldStringValues(logs, 'roleId');
  if (roleIds.length > 0) {
    const roles = await db.role.findMany({
      where: { tenantId, id: { in: roleIds } },
      select: { id: true, name: true },
    });
    labels.set('roleId', makeFieldMap(roles.map((r) => ({ id: r.id, label: r.name }))));
  }

  // ── userId / createdById / updatedById / assignedToId / ownerId ──
  const userIdFields = ['userId', 'createdById', 'updatedById', 'assignedToId', 'ownerId'] as const;
  const allUserIds = Array.from(
    new Set([
      ...collectUserIds(logs),
      ...userIdFields.flatMap((field) => collectFieldStringValues(logs, field)),
    ]),
  );

  if (allUserIds.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = makeFieldMap(users.map((u) => ({ id: u.id, label: `${u.name} (${u.email})` })));
    for (const field of userIdFields) {
      labels.set(field, userMap);
    }
  }

  return labels;
}
