import { AppModule, FeatureKey, FeatureType, Plan, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PLAN_FEATURE_ROWS } from '@repo/types/plans';
import type { PerformanceFixture } from '@repo/types/performance';
import { createSecuritySession } from '../../src/services/security-hardening.service.js';

export async function seedPerformance(db: PrismaClient): Promise<PerformanceFixture> {
  if (await db.tenant.count()) throw new Error('Performance seeding requires an empty disposable database.');
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('A dedicated performance JWT secret is required.');
  for (const row of PLAN_FEATURE_ROWS) {
    const data = { plan: Plan[row.plan], key: row.key, featureKey: FeatureKey[row.featureKey], type: FeatureType[row.type], value: row.value, isEnabled: row.value !== 'false' };
    await db.planFeature.upsert({ where: { plan_featureKey: { plan: data.plan, featureKey: data.featureKey } }, create: data, update: { type: data.type, value: data.value, isEnabled: data.isEnabled } });
  }
  const runId = `phase8-${randomUUID()}`;
  const actors: PerformanceFixture['actors'] = [];
  const groups = Number(process.env.PERF_TENANT_GROUPS ?? 50);
  const usersPerTenant = Number(process.env.PERF_USERS_PER_TENANT ?? 5);
  if (!Number.isInteger(groups) || groups < 1 || groups > 100 || !Number.isInteger(usersPerTenant) || usersPerTenant < 1 || usersPerTenant > 5) throw new Error('Fixture requires 1..100 tenant groups and 1..5 users per tenant.');
  for (let group = 0; group < groups; group++) {
  for (const plan of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const) {
    const tenant = await db.tenant.create({ data: { slug: `${runId}-${plan.toLowerCase()}-${group}`, companyName: `Synthetic ${plan}`, email: `${plan}@example.test`, status: 'ACTIVE', plan, modules: Object.values(AppModule) } });
    const user = await db.user.create({ data: { email: `${tenant.id}@example.test`, name: 'Synthetic performance owner', password: 'not-a-login-password', tenants: { create: { tenantId: tenant.id, isOwner: true } } } });
    const users = [user];
    for (let index = 1; index < usersPerTenant; index++) users.push(await db.user.create({ data: { email: `${tenant.id}-${index}@example.test`, name: 'Synthetic performance actor', password: 'not-a-login-password', tenants: { create: { tenantId: tenant.id, isOwner: true } } } }));
    const contact = await db.contact.create({ data: { tenantId: tenant.id, type: 'BOTH', code: 'PERF', name: 'Synthetic customer' } });
    const unit = await db.unit.create({ data: { tenantId: tenant.id, code: 'PCS', name: 'Piece' } });
    const product = await db.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: 'PERF', name: 'Synthetic product', salesPrice: 100, purchasePrice: 40 } });
    await db.product.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ tenantId: tenant.id, unitId: unit.id, code: `PERF-${index}`, name: `Synthetic product ${index}`, salesPrice: 100, purchasePrice: 40 })) });
    const warehouse = await db.warehouse.create({ data: { tenantId: tenant.id, code: 'MAIN', name: 'Synthetic warehouse' } });
    const location = await db.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, code: 'PERF', name: 'Synthetic stock location' } });
    await db.stockLevel.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, locationId: location.id, quantity: 100_000 } });
    const opening = await db.stockMovement.create({ data: { tenantId: tenant.id, productId: product.id, toWarehouseId: warehouse.id, locationId: location.id, type: 'IN', quantity: 100_000, unitCost: 40, totalCost: 4_000_000, idempotencyKey: `opening-${tenant.id}` } });
    await db.stockValuation.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, movementId: opening.id, date: new Date(), qtyIn: 100_000, qtyBalance: 100_000, unitCost: 40, totalValue: 4_000_000 } });
    const cash = await db.cashAccount.create({ data: { tenantId: tenant.id, name: 'Synthetic cash', currencyCode: 'TRY' } });
    const tax = await db.taxRate.create({ data: { tenantId: tenant.id, name: 'VAT 20', rate: 20 } });
    await db.moduleSetting.create({ data: { tenantId: tenant.id, module: 'inventory', key: 'negative_stock_policy', value: 'BLOCK' } });
    await db.ledgerAccount.createMany({ data: ([['100', 'ASSET'], ['120', 'ASSET'], ['150', 'ASSET'], ['152', 'ASSET'], ['153', 'ASSET'], ['191', 'ASSET'], ['320', 'LIABILITY'], ['391', 'LIABILITY'], ['600', 'REVENUE'], ['689', 'EXPENSE']] as const).map(([code, accountType]) => ({ tenantId: tenant.id, code, accountType, name: code })) });
    const conversation = await db.chatConversation.create({ data: { tenantId: tenant.id, type: 'GROUP', title: 'Synthetic performance group', createdById: user.id, members: { create: users.map((member) => ({ tenantId: tenant.id, userId: member.id, role: member.id === user.id ? 'OWNER' as const : 'MEMBER' as const })) } } });
    for (const member of users) {
      const session = await createSecuritySession(db, tenant.id, member.id, { ipAddress: null, userAgent: 'Phase8 synthetic actor' });
      actors.push({ tenantId: tenant.id, plan, userId: member.id, token: jwt.sign({ userId: member.id, tenantId: tenant.id, sessionId: session.id }, secret, { expiresIn: '48h' }), contactId: contact.id, productId: product.id, warehouseId: warehouse.id, cashAccountId: cash.id, taxRateId: tax.id, conversationId: conversation.id });
    }
  }
  }
  return { schemaVersion: 1, runId, actors };
}
