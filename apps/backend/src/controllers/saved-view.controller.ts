import { Context } from 'hono';
import { Plan, Prisma, SavedViewScope } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, LimitExceededError, NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';

type SavedViewPayload = {
  name: string;
  module: string;
  listKey: string;
  scope: SavedViewScope;
  state: Prisma.JsonObject;
  roleId?: string;
  isDefault: boolean;
};

type PartialSavedViewPayload = Partial<Pick<SavedViewPayload, 'name' | 'state' | 'isDefault'>>;

const PLAN_LIMITS: Record<Plan, number> = {
  STARTER: 3,
  PROFESSIONAL: 50,
  ENTERPRISE: 500,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is Prisma.JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function isJsonObject(value: unknown): value is Prisma.JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function parseScope(value: unknown): SavedViewScope {
  if (value === undefined) return SavedViewScope.PERSONAL;
  if (value === SavedViewScope.PERSONAL) return SavedViewScope.PERSONAL;
  if (value === SavedViewScope.TENANT) return SavedViewScope.TENANT;
  if (value === SavedViewScope.ROLE) return SavedViewScope.ROLE;
  throw new ValidationError('Geçerli bir görünüm paylaşım tipi seçilmelidir.');
}

function parseCreatePayload(value: unknown): SavedViewPayload {
  const payload = parseSavedViewPayload(value);
  if (!payload.name || !payload.module || !payload.listKey || !payload.state) {
    throw new ValidationError('name, module, listKey ve state alanları zorunludur.');
  }

  return {
    name: payload.name,
    module: payload.module,
    listKey: payload.listKey,
    state: payload.state,
    scope: payload.scope ?? SavedViewScope.PERSONAL,
    roleId: payload.roleId,
    isDefault: payload.isDefault ?? false,
  };
}

function parseUpdatePayload(value: unknown): PartialSavedViewPayload {
  const payload = parseSavedViewPayload(value);
  return {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.state !== undefined ? { state: payload.state } : {}),
    ...(payload.isDefault !== undefined ? { isDefault: payload.isDefault } : {}),
  };
}

function parseSavedViewPayload(value: unknown): Partial<SavedViewPayload> {
  if (!isRecord(value)) {
    throw new ValidationError('Geçerli bir görünüm verisi gönderilmelidir.');
  }

  const payload: Partial<SavedViewPayload> = {};

  if (value.name !== undefined) {
    if (typeof value.name !== 'string' || value.name.trim().length === 0) {
      throw new ValidationError('Görünüm adı zorunludur.');
    }
    payload.name = value.name.trim();
  }

  if (value.module !== undefined) {
    if (typeof value.module !== 'string' || value.module.trim().length === 0) {
      throw new ValidationError('Modül alanı zorunludur.');
    }
    payload.module = value.module.trim();
  }

  if (value.listKey !== undefined) {
    if (typeof value.listKey !== 'string' || value.listKey.trim().length === 0) {
      throw new ValidationError('Liste anahtarı zorunludur.');
    }
    payload.listKey = value.listKey.trim();
  }

  if (value.scope !== undefined) {
    payload.scope = parseScope(value.scope);
  }

  if (value.state !== undefined) {
    if (!isJsonObject(value.state)) {
      throw new ValidationError('Görünüm durumu nesne formatında olmalıdır.');
    }
    payload.state = value.state;
  }

  if (value.roleId !== undefined) {
    if (typeof value.roleId !== 'string' || value.roleId.trim().length === 0) {
      throw new ValidationError('Rol görünümü için roleId zorunludur.');
    }
    payload.roleId = value.roleId.trim();
  }

  if (value.isDefault !== undefined) {
    if (typeof value.isDefault !== 'boolean') {
      throw new ValidationError('Varsayılan görünüm bilgisi boolean olmalıdır.');
    }
    payload.isDefault = value.isDefault;
  }

  return payload;
}

async function getTenantUserContext(tenantId: string, userId: string) {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true },
    select: { isOwner: true, roleId: true },
  });
  if (!tenantUser) throw new ForbiddenError('Bu tenant için aktif kullanıcı bulunamadı.');
  return tenantUser;
}

function ensureSharedScopeAllowed(scope: SavedViewScope, isOwner: boolean): void {
  if (scope !== SavedViewScope.PERSONAL && !isOwner) {
    throw new ForbiddenError('Tenant veya rol geneli görünüm oluşturmak için owner yetkisi gerekir.');
  }
}

async function ensurePlanLimit(tenantId: string, userId: string, scope: SavedViewScope): Promise<void> {
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { plan: true } });
  if (!tenant) throw new ForbiddenError('Tenant bulunamadı.');

  if (tenant.plan === Plan.STARTER && scope !== SavedViewScope.PERSONAL) {
    throw new ForbiddenError('Starter pakette yalnızca kişisel liste görünümleri kaydedilebilir.');
  }

  const limit = PLAN_LIMITS[tenant.plan];
  const current = await prisma.savedView.count({
    where: tenant.plan === Plan.STARTER ? { tenantId, userId } : { tenantId },
  });

  if (current >= limit) {
    throw new LimitExceededError('Kayıtlı görünüm', limit, current);
  }
}

async function validateRole(tenantId: string, roleId: string): Promise<void> {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true } });
  if (!role) throw new ValidationError('Seçilen rol bu tenant içinde bulunamadı.');
}

function canManageView(view: { scope: SavedViewScope; userId: string | null }, userId: string, isOwner: boolean): boolean {
  if (isOwner) return true;
  return view.scope === SavedViewScope.PERSONAL && view.userId === userId;
}

export const SavedViewController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const listKey = c.req.query('listKey');
    const tenantUser = await getTenantUserContext(tenantId, userId);

    const visibleScopes: Prisma.SavedViewWhereInput[] = [
      { scope: SavedViewScope.PERSONAL, userId },
      { scope: SavedViewScope.TENANT },
    ];
    if (tenantUser.roleId) {
      visibleScopes.push({ scope: SavedViewScope.ROLE, roleId: tenantUser.roleId });
    }

    const views = await prisma.savedView.findMany({
      where: {
        tenantId,
        ...(listKey ? { listKey } : {}),
        OR: visibleScopes,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    return c.json({ data: views });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const tenantUser = await getTenantUserContext(tenantId, userId);
    const payload = parseCreatePayload(await c.req.json());

    ensureSharedScopeAllowed(payload.scope, tenantUser.isOwner);
    await ensurePlanLimit(tenantId, userId, payload.scope);

    const roleId = payload.scope === SavedViewScope.ROLE ? payload.roleId : undefined;
    if (payload.scope === SavedViewScope.ROLE) {
      if (!roleId) throw new ValidationError('Rol görünümü için roleId zorunludur.');
      await validateRole(tenantId, roleId);
    }

    const ownerUserId = payload.scope === SavedViewScope.PERSONAL ? userId : null;
    const ownerRoleId = payload.scope === SavedViewScope.ROLE ? roleId ?? null : null;

    const created = await prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.savedView.updateMany({
          where: { tenantId, listKey: payload.listKey, scope: payload.scope, userId: ownerUserId, roleId: ownerRoleId },
          data: { isDefault: false },
        });
      }

      return tx.savedView.create({
        data: {
          tenantId,
          userId: ownerUserId,
          roleId: ownerRoleId,
          createdById: userId,
          name: payload.name,
          module: payload.module,
          listKey: payload.listKey,
          scope: payload.scope,
          state: payload.state,
          isDefault: payload.isDefault,
        },
      });
    });

    return c.json({ data: created }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const viewId = c.req.param('id');
    const tenantUser = await getTenantUserContext(tenantId, userId);

    const view = await prisma.savedView.findFirst({
      where: { id: viewId, tenantId },
      select: { id: true, scope: true, userId: true, roleId: true, listKey: true },
    });
    if (!view) return c.json(new NotFoundError('Görünüm', viewId).toJSON(), 404);
    if (!canManageView(view, userId, tenantUser.isOwner)) {
      return c.json(new ForbiddenError('Bu görünümü düzenleme yetkiniz yok.').toJSON(), 403);
    }

    const payload = parseUpdatePayload(await c.req.json());

    const updated = await prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.savedView.updateMany({
          where: { tenantId, listKey: view.listKey, scope: view.scope, userId: view.userId, roleId: view.roleId },
          data: { isDefault: false },
        });
      }

      return tx.savedView.update({
        where: { id: view.id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.state !== undefined ? { state: payload.state } : {}),
          ...(payload.isDefault !== undefined ? { isDefault: payload.isDefault } : {}),
        },
      });
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const viewId = c.req.param('id');
    const tenantUser = await getTenantUserContext(tenantId, userId);

    const view = await prisma.savedView.findFirst({
      where: { id: viewId, tenantId },
      select: { id: true, scope: true, userId: true },
    });
    if (!view) return c.json(new NotFoundError('Görünüm', viewId).toJSON(), 404);
    if (!canManageView(view, userId, tenantUser.isOwner)) {
      return c.json(new ForbiddenError('Bu görünümü silme yetkiniz yok.').toJSON(), 403);
    }

    await prisma.savedView.delete({ where: { id: view.id } });
    return c.json({ data: { success: true } });
  },
};
