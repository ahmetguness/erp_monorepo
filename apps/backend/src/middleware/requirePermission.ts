import { Context, Next } from 'hono';
import { PermissionAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';

/**
 * Rol bazlı yetkilendirme middleware'i.
 * Kullanıcının tenant'taki rolünde belirtilen modül + aksiyon izni olup olmadığını kontrol eder.
 *
 * - Owner kullanıcılar her zaman geçer (tam yetki).
 * - Rolü olmayan kullanıcılar sadece READ izni olan endpoint'lere erişebilir (eğer action READ ise).
 * - requireAuth middleware'inden sonra kullanılmalıdır.
 *
 * Kullanım: requirePermission('accounting', 'CREATE')
 */
export function requirePermission(module: string, action: PermissionAction) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const userId = c.get('userId') as string | undefined;
    const tenantId = c.get('tenantId') as string | undefined;

    if (!userId || !tenantId) {
      return c.json(new ForbiddenError('Yetkilendirme bilgisi eksik.').toJSON(), 403);
    }

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, userId, isActive: true },
      select: {
        isOwner: true,
        roleId: true,
        roleRef: {
          select: {
            permissions: {
              select: { module: true, action: true },
            },
          },
        },
      },
    });

    if (!tenantUser) {
      return c.json(new ForbiddenError('Bu tenant\'a erişiminiz yok.').toJSON(), 403);
    }

    // Owner her zaman geçer
    if (tenantUser.isOwner) {
      await next();
      return;
    }

    // Rolü yoksa → engelle
    if (!tenantUser.roleId || !tenantUser.roleRef) {
      return c.json(
        new ForbiddenError(`Bu işlem için yetkiniz yok (${module}:${action}).`).toJSON(),
        403,
      );
    }

    // İzin kontrolü
    const hasPermission = tenantUser.roleRef.permissions.some(
      (p) => p.module === module && p.action === action,
    );

    if (!hasPermission) {
      return c.json(
        new ForbiddenError(`Bu işlem için yetkiniz yok (${module}:${action}).`).toJSON(),
        403,
      );
    }

    await next();
  };
}
