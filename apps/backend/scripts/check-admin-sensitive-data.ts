import 'dotenv/config';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { redactSensitiveText, redactSensitiveValue } from '../src/lib/sensitive-redaction.js';
import {
  canRevealError,
  createSensitiveAccessGrant,
  getSensitiveAccessState,
  maskTenantForAdmin,
} from '../src/modules/platform/sensitive-data/sensitive-data.service.js';

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(admin, 'Hassas veri testi için aktif admin gerekli.');
  const suffix = `${Date.now()}`;
  const tenant = await prisma.tenant.create({
    data: {
      slug: `sensitive-data-${suffix}`,
      companyName: 'Sensitive Data Test',
      email: `owner-${suffix}@example.test`,
      phone: '+90 532 123 45 67',
    },
    select: { id: true, email: true, phone: true },
  });

  try {
    const masked = await maskTenantForAdmin(admin.id, tenant);
    assert.notEqual(masked.email, tenant.email);
    assert.equal(masked.email.includes('owner-'), false);
    assert.equal(masked.phone, '*** *** 4567');
    assert.deepEqual(masked.sensitiveAccess.revealedFields, []);

    const grant = await createSensitiveAccessGrant(admin.id, {
      tenantId: tenant.id,
      fields: ['email', 'phone', 'errorDetails'],
      purpose: 'SUPPORT_CASE',
      reason: 'Doğrulanmış destek kaydındaki bağlantı sorununu inceleme.',
    }, { ipAddress: '127.0.0.1', device: 'integration-test', requestId: `sensitive-${suffix}` });
    assert.ok(new Date(grant.expiresAt).getTime() > Date.now());
    assert.ok(new Date(grant.expiresAt).getTime() <= Date.now() + 15 * 60 * 1000);

    const revealed = await maskTenantForAdmin(admin.id, tenant);
    assert.equal(revealed.email, tenant.email);
    assert.equal(revealed.phone, tenant.phone);
    assert.equal(await canRevealError(admin.id, tenant.id), true);
    const state = await getSensitiveAccessState(admin.id, tenant.id);
    assert.deepEqual([...state.revealedFields].sort(), ['email', 'errorDetails', 'phone']);

    const audit = await prisma.platformAdminAuditLog.findFirst({
      where: { actorId: admin.id, action: 'SENSITIVE_DATA_REVEALED', targetId: tenant.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit, 'Hassas veri erişim audit kaydı oluşmalı.');
    assert.equal(audit.reason, 'Doğrulanmış destek kaydındaki bağlantı sorununu inceleme.');

    const text = redactSensitiveText('mail user@example.test tel +90 532 123 45 67 Bearer abcdefghijklmnopqrstuvwxyz123456 apiSecret=test-secret');
    assert.equal(text.includes('user@example.test'), false);
    assert.equal(text.includes('532 123'), false);
    assert.equal(text.includes('abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(text.includes('test-secret'), false);
    assert.equal(redactSensitiveText('requestId=82efa6da-dd64-4d70-a123-456789abcdef'), 'requestId=82efa6da-dd64-4d70-a123-456789abcdef');
    const payload = redactSensitiveValue({ email: 'user@example.test', nested: { apiKey: 'secret-value', note: 'ara user@example.test' } });
    assert.deepEqual(payload, { email: '[REDACTED]', nested: { apiKey: '[REDACTED]', note: 'ara ***@***' } });
    console.log('Admin hassas veri maskeleme ve süreli erişim kontrolleri başarılı.');
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
