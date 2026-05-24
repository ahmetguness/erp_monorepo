import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { AuditFieldValueLabels } from './audit-log-formatter.service';

interface AuditFieldLabelSource {
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  userId: string | null;
}

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectFieldStringValues(logs: readonly AuditFieldLabelSource[], field: string): string[] {
  const values = new Set<string>();
  logs.forEach((log) => {
    [log.oldValues, log.newValues].forEach((json) => {
      if (!isJsonObject(json)) return;
      const value = json[field];
      if (typeof value === 'string' && value.trim()) values.add(value);
    });
  });
  return Array.from(values);
}

function collectUserIds(logs: readonly AuditFieldLabelSource[]): string[] {
  return Array.from(new Set(logs.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))));
}

function fieldLabelMap(entries: Array<{ id: string; label: string }>): ReadonlyMap<string, string> {
  return new Map(entries.map((entry) => [entry.id, entry.label]));
}

export async function resolveAuditFieldValueLabels(
  db: PrismaClient,
  tenantId: string,
  logs: readonly AuditFieldLabelSource[],
): Promise<AuditFieldValueLabels> {
  const labels = new Map<string, ReadonlyMap<string, string>>();

  const contactIds = collectFieldStringValues(logs, 'contactId');
  if (contactIds.length > 0) {
    const contacts = await db.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true, code: true, name: true },
    });
    labels.set('contactId', fieldLabelMap(contacts.map((contact) => ({
      id: contact.id,
      label: contact.code ? `${contact.code} - ${contact.name}` : contact.name,
    }))));
  }

  const productIds = collectFieldStringValues(logs, 'productId');
  if (productIds.length > 0) {
    const products = await db.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, code: true, name: true },
    });
    labels.set('productId', fieldLabelMap(products.map((product) => ({
      id: product.id,
      label: `${product.code} - ${product.name}`,
    }))));
  }

  const userIds = Array.from(new Set([
    ...collectFieldStringValues(logs, 'userId'),
    ...collectFieldStringValues(logs, 'createdById'),
    ...collectFieldStringValues(logs, 'updatedById'),
    ...collectUserIds(logs),
  ]));
  if (userIds.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = fieldLabelMap(users.map((user) => ({
      id: user.id,
      label: `${user.name} (${user.email})`,
    })));
    labels.set('userId', userMap);
    labels.set('createdById', userMap);
    labels.set('updatedById', userMap);
  }

  return labels;
}
