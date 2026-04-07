import { Context, Next } from 'hono';
import { prisma } from '../lib/prisma';
import { ModuleDisabledError, ForbiddenError } from '../errors';
import { STARTER_OPEN_MODULES } from '../types/feature.types';
import { ModuleKey } from '../types/module.types';
import { isModuleInList } from '../utils/feature-helpers';

// ─────────────────────────────────────────────
// requireModule Middleware
// Tenant'ın belirli bir modüle erişimi olup olmadığını kontrol eder.
// ─────────────────────────────────────────────

/**
 * Kullanım: app.use('/api/purchasing/...', requireModule('purchasing'))
 */
export function requireModule(module: ModuleKey) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { modules: true },
    });

    if (!tenant) {
      return c.json(new ForbiddenError('Tenant bulunamadı.').toJSON(), 403);
    }

    // Tenant modules listesi doluysa → listede olmalı
    // Tenant modules listesi boşsa → Starter açık modüllere izin ver
    const isOpenModule = isModuleInList([...STARTER_OPEN_MODULES], module);

    if (tenant.modules.length > 0) {
      if (!isModuleInList(tenant.modules, module)) {
        return c.json(new ModuleDisabledError(module).toJSON(), 403);
      }
    } else if (!isOpenModule) {
      // Modules listesi boş ve kapalı modül → engelle
      return c.json(new ModuleDisabledError(module).toJSON(), 403);
    }

    await next();
  };
}
