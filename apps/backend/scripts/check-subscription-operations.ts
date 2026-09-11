import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { applyCoupon, createCoupon, decideCustomPrice, getRevenueOverview, getSubscriptionSnapshot, ingestProviderEvent, quotePlanChange, reconcileEntitlements, requestCustomPrice, SubscriptionOperationsError } from '../src/modules/platform/subscription-operations/subscription-operations.service.js';

const suffix = `${Date.now()}-${process.pid}`; let tenantId: string | undefined; const admins: string[] = []; const eventIds = [`active-${suffix}`, `failed-${suffix}`, `paid-${suffix}`];
async function main(): Promise<void> {
  const tenant = await prisma.tenant.create({ data: { slug: `billing-${suffix}`, companyName: 'Billing Test', email: `billing-${suffix}@test.local`, plan: 'STARTER', status: 'ACTIVE', modules: ['ACCOUNTING'] } }); tenantId = tenant.id;
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  for (const index of [1, 2]) { const admin = await prisma.adminUser.create({ data: { email: `billing-admin-${index}-${suffix}@test.local`, name: `Billing Admin ${index}`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: role.id } } } }); admins.push(admin.id); }
  const [first, second] = admins as [string, string];
  let snapshot = await getSubscriptionSnapshot(tenantId); assert.ok(snapshot.missingModules.length > 0);
  snapshot = await reconcileEntitlements(tenantId, first); assert.equal(snapshot.missingModules.length, 0); assert.equal(snapshot.extraModules.length, 0);
  const quote = await quotePlanChange(tenantId, 'PROFESSIONAL', new Date()); assert.equal(quote.fromPlan, 'STARTER'); assert.ok(Number(quote.nextMonthly) > Number(quote.currentMonthly)); assert.ok(quote.moduleChanges.added.length > 0);
  await ingestProviderEvent({ provider: 'STRIPE', providerEventId: eventIds[0], tenantId, type: 'SUBSCRIPTION_ACTIVE', providerCustomerId: `cus-${suffix}`, amount: 1990, currency: 'TRY' }, first);
  await ingestProviderEvent({ provider: 'STRIPE', providerEventId: eventIds[1], tenantId, type: 'INVOICE_FAILED', providerInvoiceId: `inv-${suffix}`, amount: 1990, currency: 'TRY', failureReason: 'card_declined' }, first);
  await ingestProviderEvent({ provider: 'STRIPE', providerEventId: eventIds[1], tenantId, type: 'INVOICE_FAILED', providerInvoiceId: `inv-${suffix}`, amount: 1990, currency: 'TRY', failureReason: 'card_declined' }, first);
  snapshot = await getSubscriptionSnapshot(tenantId); assert.equal(snapshot.state, 'PAST_DUE'); assert.equal(snapshot.dunningAttempt, 1); assert.equal(snapshot.invoices[0]?.status, 'FAILED');
  await ingestProviderEvent({ provider: 'STRIPE', providerEventId: eventIds[2], tenantId, type: 'INVOICE_PAID', providerInvoiceId: `inv-${suffix}`, amount: 1990, currency: 'TRY' }, first);
  snapshot = await getSubscriptionSnapshot(tenantId); assert.equal(snapshot.state, 'ACTIVE'); assert.equal(snapshot.dunningAttempt, 0); assert.equal(snapshot.invoices[0]?.status, 'PAID');
  const coupon = await createCoupon({ code: `TEST_${suffix}`.replace(/-/g, '_'), percent: 10, expiresAt: new Date(Date.now() + 86400000), maxRedemptions: 1 });
  snapshot = await applyCoupon(tenantId, coupon.code, first); assert.equal(snapshot.discount?.percent, 10); assert.equal(snapshot.mrr, '1791.00');
  await applyCoupon(tenantId, coupon.code, first); assert.equal((await prisma.billingCoupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount, 1);
  const request = await requestCustomPrice(tenantId, first, { monthlyAmount: 2500, unitPrice: 125, expiresAt: new Date(Date.now() + 86400000), reason: 'Approved negotiated annual contract' });
  await assert.rejects(decideCustomPrice(tenantId, request.id, first, 'approve'), SubscriptionOperationsError); await decideCustomPrice(tenantId, request.id, second, 'approve');
  snapshot = await getSubscriptionSnapshot(tenantId); assert.equal(snapshot.customUnitPrice, '125.00'); assert.ok((await getRevenueOverview()).activeSubscriptions >= 1);
  console.log('Subscription operations integration: OK (provider events, invoices, MRR/ARR, dunning, coupon, quote, entitlements, two-person custom price)');
}
main().finally(async () => { await prisma.billingProviderEvent.deleteMany({ where: { providerEventId: { in: eventIds } } }); if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } }); await prisma.billingCoupon.deleteMany({ where: { code: { startsWith: 'TEST_' } } }); await prisma.adminUser.deleteMany({ where: { id: { in: admins } } }); await prisma.$disconnect(); }).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
