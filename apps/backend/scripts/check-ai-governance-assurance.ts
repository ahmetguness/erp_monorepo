import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_AI_GOVERNANCE_${Date.now()}`;
type Session = { cookie: string };

async function api(session: Session | null, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug: slug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const member = await prisma.user.findUniqueOrThrow({ where: { email: 'muhasebe@axondemo.com' } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  const tenantP = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-p`, companyName: `${marker}_P`, email: `${marker}-p@example.test`, plan: 'PROFESSIONAL', status: 'ACTIVE' } });
  try {
    await prisma.tenantUser.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, isOwner: true },
      { tenantId: tenantA.id, userId: member.id },
      { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      { tenantId: tenantP.id, userId: owner.id, isOwner: true },
    ] });
    await prisma.aiRequestLog.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, requestType: 'PRIVATE_CHAT', promptVersion: 'test:v1', model: 'gpt-4o', permissionCheckResult: 'ALLOWED', status: 'SUCCEEDED', tokenPrompt: 400, tokenCompletion: 600, tokenTotal: 1000, inputSummary: 'TEST masked email', redactedFields: ['email'] },
      { tenantId: tenantA.id, userId: owner.id, requestType: 'MAIL_DRAFT', promptVersion: 'test:v1', model: 'gpt-4o-mini', permissionCheckResult: 'DENIED', status: 'FAILED', tokenPrompt: 1000, tokenCompletion: 1000, tokenTotal: 2000, errorMessage: 'TEST controlled failure', redactedFields: ['phone'] },
      { tenantId: tenantA.id, userId: owner.id, requestType: 'OTHER', promptVersion: 'test:v1', model: 'system', permissionCheckResult: 'PARTIAL', status: 'FALLBACK', tokenTotal: 0 },
      { tenantId: tenantB.id, userId: owner.id, requestType: 'PRIVATE_CHAT', promptVersion: 'foreign:v1', model: 'gpt-4.1', permissionCheckResult: 'ALLOWED', status: 'SUCCEEDED', tokenTotal: 999999, inputSummary: 'FOREIGN_TENANT_SECRET' },
    ] });

    assert.equal((await api(null, '/api/intelligence/ai-governance/logs')).status, 401);
    const unauthorized = await login(member.email, tenantA.slug);
    assert.equal((await api(unauthorized, '/api/intelligence/ai-governance/logs')).status, 403);
    assert.equal((await api(unauthorized, '/api/intelligence/ai-governance/policy', 'PUT', { enabled: false, dataSharingPolicy: 'NO_ENTITY_CONTEXT', logPrompts: false })).status, 403);

    let a = await login(owner.email, tenantA.slug);
    const defaultPolicy = await api(a, '/api/intelligence/ai-governance/policy');
    assert.equal(defaultPolicy.status, 200);
    assert.deepEqual(defaultPolicy.body.data.policy, { enabled: true, dataSharingPolicy: 'BUSINESS_CONTEXT', logPrompts: true });
    assert.ok(defaultPolicy.body.data.redactionRegistry.fieldKeys.includes('email'));

    const policy = await api(a, '/api/intelligence/ai-governance/policy', 'PUT', { enabled: false, dataSharingPolicy: 'NO_ENTITY_CONTEXT', logPrompts: false });
    assert.equal(policy.status, 200);
    assert.deepEqual(policy.body.data.policy, { enabled: false, dataSharingPolicy: 'NO_ENTITY_CONTEXT', logPrompts: false });
    assert.equal(await prisma.moduleSetting.count({ where: { tenantId: tenantA.id, module: 'ai', key: { in: ['enabled', 'data_sharing_policy', 'log_prompts'] } } }), 3);
    assert.equal((await api(a, '/api/intelligence/ai-governance/policy', 'PUT', { enabled: 'false', dataSharingPolicy: 'INVALID', logPrompts: false })).status, 400);
    assert.equal((await api(a, '/api/intelligence/ai-governance/policy', 'PUT', {})).status, 400);

    const cost = await api(a, '/api/intelligence/ai-governance/insights/settings', 'PUT', { monthlyCostLimitUsd: 0.005, alertThresholdPercent: 80, blockOnLimit: true });
    assert.equal(cost.status, 200);
    assert.equal(cost.body.data.costSettings.monthlyCostLimitUsd, 0.01);
    assert.equal(cost.body.data.costSettings.alertThresholdPercent, 80);
    assert.equal(cost.body.data.costSettings.blockOnLimit, true);
    assert.equal(await prisma.moduleSetting.count({ where: { tenantId: tenantA.id, module: 'ai' } }), 6);
    assert.equal((await api(a, '/api/intelligence/ai-governance/insights/settings', 'PUT', { monthlyCostLimitUsd: -1, alertThresholdPercent: 80, blockOnLimit: true })).status, 400);
    assert.equal((await api(a, '/api/intelligence/ai-governance/insights/settings', 'PUT', { monthlyCostLimitUsd: 1, alertThresholdPercent: 0, blockOnLimit: true })).status, 400);
    assert.equal((await api(a, '/api/intelligence/ai-governance/insights/settings', 'PUT', { monthlyCostLimitUsd: 1, alertThresholdPercent: 101, blockOnLimit: true })).status, 400);
    assert.equal((await api(a, '/api/intelligence/ai-governance/insights/settings', 'PUT', { monthlyCostLimitUsd: 1, alertThresholdPercent: 80, blockOnLimit: 'true' })).status, 400);

    const insights = await api(a, '/api/intelligence/ai-governance/insights');
    assert.equal(insights.status, 200);
    assert.equal(insights.body.data.costSummary.totalRequests, 3);
    assert.equal(insights.body.data.costSummary.totalTokens, 3000);
    assert.equal(insights.body.data.costSummary.estimatedCostUsd, 0.0056);
    assert.equal(insights.body.data.costSummary.usagePercent, 56);
    assert.equal(insights.body.data.costSummary.status, 'OK');
    assert.equal(insights.body.data.maskingReport.length, 2);
    assert.equal(insights.body.data.enterpriseControlCenter.observability.failedAiRequestCount, 1);
    assert.equal(insights.body.data.enterpriseControlCenter.observability.fallbackAiRequestCount, 1);
    assert.equal(insights.body.data.enterpriseControlCenter.observability.deniedPermissionCount, 1);

    const logs = await api(a, '/api/intelligence/ai-governance/logs?page=1&limit=2&status=FAILED&requestType=MAIL_DRAFT');
    assert.equal(logs.status, 200);
    assert.equal(logs.body.meta.total, 1);
    assert.equal(logs.body.data.length, 1);
    assert.equal(logs.body.data[0].errorMessage, 'TEST controlled failure');
    assert.equal(JSON.stringify(logs.body).includes('FOREIGN_TENANT_SECRET'), false);
    const clamped = await api(a, '/api/intelligence/ai-governance/logs?page=-5&limit=999');
    assert.equal(clamped.status, 200);
    assert.equal(clamped.body.meta.page, 1);
    assert.equal(clamped.body.meta.pageSize, 100);
    assert.equal(clamped.body.meta.total, 3);

    assert.ok(await prisma.auditLog.count({ where: { tenantId: tenantA.id, module: 'ai_governance', action: 'UPDATE' } }) >= 2);

    const b = await login(owner.email, tenantB.slug);
    const foreignLogs = await api(b, '/api/intelligence/ai-governance/logs');
    assert.equal(foreignLogs.status, 200);
    assert.equal(foreignLogs.body.meta.total, 1);
    assert.equal(foreignLogs.body.data[0].inputSummary, 'FOREIGN_TENANT_SECRET');
    assert.equal(JSON.stringify(foreignLogs.body).includes('TEST controlled failure'), false);

    const p = await login(owner.email, tenantP.slug);
    assert.equal((await api(p, '/api/intelligence/ai-governance/policy', 'PUT', { enabled: true, dataSharingPolicy: 'BUSINESS_CONTEXT', logPrompts: true })).status, 403);
    a = await login(owner.email, tenantA.slug);
    assert.deepEqual((await api(a, '/api/intelligence/ai-governance/policy')).body.data.policy, { enabled: false, dataSharingPolicy: 'NO_ENTITY_CONTEXT', logPrompts: false });

    console.log(JSON.stringify({ marker, policy: 'PASS', costs: { totalTokens: 3000, estimatedCostUsd: 0.0056, usagePercent: 56 }, filtersAndPagination: 'PASS', audit: 'PASS', tenantIsolation: 'PASS', authPermissionPlan: 'PASS' }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id, tenantP.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
