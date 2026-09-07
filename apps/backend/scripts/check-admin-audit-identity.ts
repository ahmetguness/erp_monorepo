import { Hono } from 'hono';
import { createAdminSession } from '../src/modules/platform/admin-auth/admin-session.service.js';
import { prisma } from '../src/lib/prisma.js';
import { runWithTenantIsolationBypass } from '../src/lib/tenant-isolation-context.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';
import { DemoController } from '../src/modules/platform/http/controllers/demo.controller.js';

const suffix = `${Date.now()}-${process.pid}`;
let demoRequestId: string | null = null;
let adminId: string | null = null;
let tenantId: string | null = null;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const admin = await prisma.adminUser.create({
    data: {
      email: `audit-actor-${suffix}@test.local`,
      name: 'Audit Actor Test',
      password: 'not-used',
      mfaEnabled: true,
    },
  });
  adminId = admin.id;

  const tenant = await prisma.tenant.create({
    data: {
      slug: `audit-actor-${suffix}`,
      companyName: 'Audit Actor Tenant',
      email: `audit-tenant-${suffix}@test.local`,
    },
  });
  tenantId = tenant.id;

  const demoRequest = await prisma.demoRequest.create({
    data: {
      fullName: 'Audit Test',
      companyName: 'Audit Test Company',
      email: `demo-audit-${suffix}@test.local`,
      tenantId: tenant.id,
    },
  });
  demoRequestId = demoRequest.id;

  const app = new Hono();
  app.use('*', requireAdmin);
  app.post('/demo-requests/:id/reject', DemoController.reject);

  const secret = process.env.ADMIN_JWT_SECRET;
  assert(typeof secret === 'string' && secret.length > 0, 'ADMIN_JWT_SECRET is required for the integration test.');
  const { accessToken: token } = await createAdminSession({
    adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion, rememberMe: false,
    ipAddress: null, userAgent: 'Integration test', jwtSecret: secret,
  });

  const response = await runWithTenantIsolationBypass('admin-console', async () => (
    await app.request(`/demo-requests/${demoRequest.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'Integration identity verification' }),
    })
  ));
  assert(response.ok, `Demo rejection returned HTTP ${response.status}.`);

  const rejected = await prisma.demoRequest.findUniqueOrThrow({
    where: { id: demoRequest.id, tenantId: tenant.id },
  });
  assert(rejected.processedBy === admin.id, 'Demo mutation did not persist the authenticated adminId.');
  assert(rejected.processedBy !== 'admin', 'Demo mutation used the forbidden fallback identity.');

  console.log('Admin audit identity integration: OK');
}

main()
  .finally(async () => {
    if (demoRequestId) {
      await runWithTenantIsolationBypass('admin-console', async () => {
        await prisma.demoRequest.deleteMany({ where: { id: demoRequestId ?? undefined } });
      });
    }
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unknown admin audit identity test error.');
    process.exit(1);
  });
