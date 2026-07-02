import { AuditAction, EntityType, Prisma } from '@prisma/client';
import type { Context } from 'hono';
import { prisma } from '../lib/prisma.js';
import { getTrustedClientIpOrNull } from './request-ip.js';
import { createAuditCriticalActionAlert } from '../services/audit-alert.service.js';

// ─────────────────────────────────────────────
// Audit Log Helper
// Tüm kritik işlemlerde audit trail oluşturur.
// ─────────────────────────────────────────────

export interface AuditLogParams {
  tenantId: string;
  userId?: string | null;
  module: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Audit log kaydı oluşturur.
 * Transaction içinde kullanılabilir (tx parametresi ile).
 * Fire-and-forget olarak da kullanılabilir (hata fırlatmaz).
 */
export async function createAuditLog(
  db: typeof prisma | Prisma.TransactionClient,
  params: AuditLogParams,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        oldValues: params.oldValues ?? Prisma.JsonNull,
        newValues: params.newValues ?? Prisma.JsonNull,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
    await createAuditCriticalActionAlert(db, {
      tenantId: params.tenantId,
      actorUserId: params.userId ?? null,
      module: params.module,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
    });
  } catch {
    // Audit log hatası ana işlemi durdurmamalı
  }
}

/**
 * Hono Context'inden IP ve User-Agent bilgisini alır.
 */
export function getRequestMeta(c: Context): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress: getTrustedClientIpOrNull(c),
    userAgent: c.req.header('user-agent') ?? null,
  };
}
