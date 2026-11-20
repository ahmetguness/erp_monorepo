import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ValidationError } from '../../../errors/index.js';
const scopeSchema = z.array(z.enum(['IDENTITY', 'MEMBERSHIP', 'AUDIT'])).min(1);
const invalidGrant = () => new ValidationError('İndirme bağlantısı geçersiz, kullanılmış veya süresi dolmuş.');
/** The one-use claim and snapshot either commit together or remain retryable. */
export async function consumePrivacyDownload(db: PrismaClient, token: string): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw invalidGrant();
  const hash = createHash('sha256').update(token).digest('hex');
  return db.$transaction(async (tx) => {
    const grant = await tx.privacyDownloadGrant.findUnique({ where: { tokenHash: hash } });
    if (!grant || grant.consumedAt || grant.expiresAt <= new Date())
      throw invalidGrant();
    const row = await tx.dataSubjectRequest.findUniqueOrThrow({ where: { id: grant.requestId } });
    if (row.type !== 'EXPORT' || row.status !== 'COMPLETED')
      throw invalidGrant();
    const scope = scopeSchema.parse(row.scope);
    const membership = await tx.tenantUser.findFirst({
      where: { tenantId: row.tenantId, user: { email: row.subjectEmail } },
      select: { tenantId: true, isActive: true, isOwner: true, user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
    });
    if (!membership)
      throw new ValidationError('Veri sahibi bulunamadı; export yeniden değerlendirilmeli.');
    const audit = scope.includes('AUDIT') ? await tx.auditLog.findMany({
      where: { tenantId: row.tenantId, userId: membership.user.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1001,
      select: { id: true, module: true, action: true, entityType: true, entityId: true, createdAt: true, requestId: true },
    }) : undefined;
    if (audit && audit.length > 1000)
      throw new ValidationError('Audit export sınırı aşıldı; kapsamlı güvenli export süreci gerekli.');
    const payload = {
      version: 1, requestId: row.id, tenantId: row.tenantId, generatedAt: new Date().toISOString(), scope,
      subject: { ...(scope.includes('IDENTITY') ? { user: membership.user } : {}), ...(scope.includes('MEMBERSHIP') ? { tenantId: membership.tenantId, isActive: membership.isActive, isOwner: membership.isOwner } : {}) },
      ...(audit ? { audit } : {}),
      limitations: 'Scoped subject export; financial retention, third-party records, attachment bodies and backups are excluded. Audit contains subject action metadata only.',
      exportedById: grant.createdById,
    };
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const claimed = await tx.privacyDownloadGrant.updateMany({ where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1)
      throw invalidGrant();
    return { ...payload, integrity: { algorithm: 'SHA-256', digest, encoding: 'JSON.stringify UTF-8, integrity field excluded' } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 1000, timeout: 5000 });
}
