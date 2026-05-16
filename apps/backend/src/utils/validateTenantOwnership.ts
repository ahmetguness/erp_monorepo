import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';

/**
 * Body'den gelen ilişkili ID'lerin (productId, contactId, warehouseId vb.)
 * gerçekten ilgili tenant'a ait olduğunu doğrular.
 *
 * Tek bir çağrıda birden fazla model ve ID doğrulanabilir.
 * Eğer herhangi bir ID tenant'a ait değilse ValidationError fırlatır.
 */

interface OwnershipCheck {
  /** Prisma model delegate adı */
  model: 'product' | 'contact' | 'warehouse' | 'unit' | 'category' | 'taxRate';
  /** Doğrulanacak ID */
  id: string;
  /** Hata mesajında kullanılacak label */
  label: string;
}

import { Prisma } from '@prisma/client';

type PrismaCountDelegate = {
  count: (args: { where: { id: string; tenantId: string; deletedAt?: null } }) => Promise<number>;
};

/** Soft-delete destekleyen modeller */
const SOFT_DELETE_MODELS = new Set<OwnershipCheck['model']>(['product', 'contact', 'warehouse']);

function getDelegate(model: OwnershipCheck['model'], tx?: Prisma.TransactionClient): PrismaCountDelegate {
  const db = tx || prisma;
  const delegates: Record<OwnershipCheck['model'], PrismaCountDelegate> = {
    product: db.product,
    contact: db.contact,
    warehouse: db.warehouse,
    unit: db.unit,
    category: db.category,
    taxRate: db.taxRate,
  };
  return delegates[model];
}

/**
 * Verilen ID'lerin tümünün belirtilen tenant'a ait olduğunu doğrular.
 * Herhangi biri eşleşmezse ValidationError fırlatır.
 */
export async function validateTenantOwnership(
  tenantId: string,
  checks: OwnershipCheck[],
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (checks.length === 0) return;

  const results = await Promise.all(
    checks.map(async (check) => {
      const delegate = getDelegate(check.model, tx);
      const where: { id: string; tenantId: string; deletedAt?: null } = {
        id: check.id,
        tenantId,
      };
      if (SOFT_DELETE_MODELS.has(check.model)) {
        where.deletedAt = null;
      }
      const count = await delegate.count({ where });
      return { check, exists: count > 0 };
    }),
  );

  const failures = results.filter((r) => !r.exists);
  if (failures.length > 0) {
    const labels = failures.map((f) => `${f.check.label} (${f.check.id})`).join(', ');
    throw new ValidationError(`Belirtilen kayıtlar bu tenant'a ait değil: ${labels}`);
  }
}

/**
 * Convenience: Bir dizi opsiyonel ID'yi OwnershipCheck listesine dönüştürür.
 * undefined/null olan ID'ler atlanır.
 */
export function buildOwnershipChecks(
  entries: Array<{ model: OwnershipCheck['model']; id: string | undefined | null; label: string }>,
): OwnershipCheck[] {
  return entries
    .filter((e): e is { model: OwnershipCheck['model']; id: string; label: string } =>
      typeof e.id === 'string' && e.id.length > 0,
    );
}
