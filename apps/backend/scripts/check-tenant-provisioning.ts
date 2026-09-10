import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { createTenantProvisioning, previewTenantProvisioning, retryTenantProvisioning } from '../src/modules/platform/tenant-provisioning/tenant-provisioning.service.js';

const suffix = `${Date.now()}-${process.pid}`;
const slug = `provision-${suffix}`;
let tenantId: string | null = null;
let jobId: string | null = null;

async function main(): Promise<void> {
  process.env.MOCK_MAIL = 'true';
  const admin = await prisma.adminUser.findFirstOrThrow({ where: { isActive: true } });
  const input = { companyName: 'Provision Test', ownerName: 'Test Owner', email: `owner-${suffix}@test.local`, slug,
    plan: 'STARTER' as const, status: 'TRIAL' as const, modules: ['accounting', 'inventory'] as const,
    subscriptionStart: new Date().toISOString(), subscriptionEnd: new Date(Date.now() + 86400000).toISOString() };
  const preview = await previewTenantProvisioning({ ...input, modules: [...input.modules] });
  assert.equal(preview.valid, true);
  assert.equal(preview.normalizedSlug, slug);
  const job = await createTenantProvisioning({ ...input, modules: [...input.modules] }, `provision:${suffix}`, admin.id);
  jobId = job.id; tenantId = job.tenantId;
  assert.equal(job.status, 'SUCCEEDED', job.error ?? undefined);
  assert.equal(job.steps.length, 4);
  assert.ok(job.steps.every(step => step.status === 'SUCCEEDED'));
  const repeated = await createTenantProvisioning({ ...input, modules: [...input.modules] }, `provision:${suffix}`, admin.id);
  assert.equal(repeated.id, job.id, 'Idempotent retry returns original job');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId! }, include: { users: true, roles: { include: { permissions: true } } } });
  assert.equal(tenant.users.length, 1);
  assert.equal(tenant.roles.length, 2);
  assert.ok(tenant.roles.some(role => role.name === 'Yönetici' && role.permissions.length > 0));
  const conflict = await previewTenantProvisioning({ ...input, modules: [...input.modules] });
  assert.equal(conflict.valid, false);
  const invalidModules = await previewTenantProvisioning({ ...input, slug: `${slug}-other`, modules: ['production'] });
  assert.equal(invalidModules.valid, false);
  await prisma.tenantProvisioningJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'Simulated delivery failure' } });
  await prisma.tenantProvisioningStep.update({ where: { jobId_key: { jobId: job.id, key: 'EMAIL_SENT' } }, data: { status: 'FAILED', error: 'Simulated delivery failure' } });
  const retried = await retryTenantProvisioning(job.id, admin.id);
  assert.equal(retried.status, 'SUCCEEDED');
  assert.ok(retried.steps.every(step => step.status === 'SUCCEEDED'));
  console.log('Tenant provisioning integration: OK (dry-run, slug, plan/modules, owner, roles, email, idempotency, steps)');
}

main().finally(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  if (jobId) await prisma.tenantProvisioningJob.deleteMany({ where: { id: jobId } });
  await prisma.user.deleteMany({ where: { email: `owner-${suffix}@test.local` } });
  await prisma.$disconnect();
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
