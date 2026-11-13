import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppModule, FeatureKey, FeatureType, Plan } from '@prisma/client';
import { PLAN_FEATURE_ROWS } from '@repo/types/plans';
import { db } from './database.js';
import type { Identity } from './http.js';

export async function fixture() {
  await db.planFeature.createMany({ data: PLAN_FEATURE_ROWS.map((row) => ({
    plan: Plan[row.plan], key: row.key, featureKey: FeatureKey[row.featureKey],
    type: FeatureType[row.type], value: row.value, isEnabled: row.value !== 'false',
  })), skipDuplicates: true });
  const runId = `${process.env.CI_RUN_ID ?? 'local'}-${randomUUID()}`;
  async function tenant(suffix: string) {
    const tenant = await db.tenant.create({ data: {
      slug: `phase3-${runId}-${suffix}`, companyName: `Phase 3 ${suffix}`, email: `${runId}-${suffix}@example.test`,
      plan: 'ENTERPRISE', status: 'ACTIVE', modules: Object.values(AppModule),
    } });
    const owner = await db.user.create({ data: {
      email: `owner-${runId}-${suffix}@example.test`, name: 'Assurance owner', password: 'non-login-fixture',
      tenants: { create: { tenantId: tenant.id, isOwner: true } },
    } });
    const identity: Identity = { token: jwt.sign({ userId: owner.id, tenantId: tenant.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' }) };
    const contact = await db.contact.create({ data: { tenantId: tenant.id, type: 'BOTH', code: 'CUSTOMER', name: 'Customer / Supplier' } });
    const unit = await db.unit.create({ data: { tenantId: tenant.id, code: 'PCS', name: 'Piece' } });
    const product = await db.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: 'PART', name: 'Material', salesPrice: 100, purchasePrice: 40 } });
    const warehouse = await db.warehouse.create({ data: { tenantId: tenant.id, code: 'MAIN', name: 'Main warehouse' } });
    const cash = await db.cashAccount.create({ data: { tenantId: tenant.id, name: 'Cash', currencyCode: 'TRY' } });
    const tax = await db.taxRate.create({ data: { tenantId: tenant.id, name: 'VAT 20', rate: 20 } });
    await db.moduleSetting.create({ data: { tenantId: tenant.id, module: 'inventory', key: 'negative_stock_policy', value: 'BLOCK' } });
    await db.ledgerAccount.createMany({ data: ([
      { code: '100', accountType: 'ASSET' }, { code: '120', accountType: 'ASSET' },
      { code: '150', accountType: 'ASSET' }, { code: '152', accountType: 'ASSET' },
      { code: '153', accountType: 'ASSET' }, { code: '191', accountType: 'ASSET' },
      { code: '320', accountType: 'LIABILITY' }, { code: '391', accountType: 'LIABILITY' },
      { code: '600', accountType: 'REVENUE' }, { code: '689', accountType: 'EXPENSE' },
      { code: '720', accountType: 'EXPENSE' }, { code: '730', accountType: 'EXPENSE' },
    ] as const).map((account) => ({ ...account, tenantId: tenant.id, name: account.code })) });
    return { tenant, owner, identity, contact, unit, product, warehouse, cash, tax };
  }
  const a = await tenant('a');
  const b = await tenant('b');
  const role = await db.role.create({ data: { tenantId: a.tenant.id, name: 'Reader', permissions: { create: { module: 'contacts', action: 'READ' } } } });
  const user = await db.user.create({ data: { email: `reader-${runId}@example.test`, name: 'Reader', password: 'non-login-fixture', tenants: { create: { tenantId: a.tenant.id, roleId: role.id } } } });
  const limited: Identity = { token: jwt.sign({ userId: user.id, tenantId: a.tenant.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' }) };
  return { a, b, limited, role, user };
}

export type TenantFixture = Awaited<ReturnType<typeof fixture>>['a'];
