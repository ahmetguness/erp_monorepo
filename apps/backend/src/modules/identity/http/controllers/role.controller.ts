import { AuditAction,EntityType,Prisma } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { addRolePermissionBodySchema,createRoleBodySchema,updateRoleBodySchema } from '../../../../schemas/request-body.schemas.js';
import { prisma } from '../../../../lib/prisma.js';
import {
listPermissionMatrix,
parsePermissionScreenPreviewInput,
parsePermissionSimulationInput,
previewUserScreens,
simulatePermission as simulatePermissionAccess,
} from '../../../../services/permission-simulator.service.js';
import { createAuditLog,getRequestMeta } from '../../../../utils/audit.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';
import { getPaginationParams } from '../../../../utils/pagination.js';

// ─────────────────────────────────────────────
// Role Controller
// Role, RolePermission
// ─────────────────────────────────────────────

export const RoleController = {
  async permissionMatrix(c: Context): Promise<Response> {
    return c.json({ data: listPermissionMatrix() });
  },

  async simulatePermission(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parsePermissionSimulationInput(await c.req.json());
    const result = await simulatePermissionAccess(tenantId, body);

    return c.json({ data: result });
  },

  async screenPreview(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parsePermissionScreenPreviewInput(await c.req.json());
    const result = await previewUserScreens(tenantId, body);

    return c.json({ data: result });
  },

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit: pageSize, skip } = getPaginationParams(c, 20);

    const where = { tenantId };

    const [total, roles] = await prisma.$transaction([
      prisma.role.count({ where }),
      prisma.role.findMany({
        where,
        include: {
          permissions: true,
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: roles,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const role = await prisma.role.findFirst({
      where: { id, tenantId },
      include: {
        permissions: true,
        _count: { select: { users: true } },
        users: {
          where: { isActive: true },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!role) return c.json(new NotFoundError('Rol', id).toJSON(), 404);
    return c.json({ data: role });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const body = getValidatedBody(c, createRoleBodySchema);

    let role;
    try {
      role = await prisma.role.create({
        data: {
          tenantId,
          name: body.name,
          description: body.description ?? null,
          ...(body.permissions?.length && {
            permissions: { create: body.permissions },
          }),
        },
        include: { permissions: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Ayni ada sahip rol zaten mevcut.');
      }
      throw error;
    }

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'roles',
      entityType: EntityType.OTHER,
      entityId: role.id,
      action: AuditAction.CREATE,
      newValues: { id: role.id, name: role.name, description: role.description, permissions: role.permissions },
      ...getRequestMeta(c),
    });

    return c.json({ data: role }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Rol', id).toJSON(), 404);

    if (existing.isSystem) {
      return c.json(new ValidationError('Sistem rolleri düzenlenemez.').toJSON(), 400);
    }

    const body = getValidatedBody(c, updateRoleBodySchema);

    let updated;
    try {
      updated = await prisma.role.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
        },
        include: { permissions: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Bu ada sahip rol zaten mevcut.');
      }
      throw error;
    }

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'roles',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { id, name: existing.name, description: existing.description },
      newValues: { id: updated.id, name: updated.name, description: updated.description },
      ...getRequestMeta(c),
    });

    return c.json({ data: updated });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Rol', id).toJSON(), 404);

    if (existing.isSystem) {
      return c.json(new ValidationError('Sistem rolleri silinemez.').toJSON(), 400);
    }

    const assignedUserCount = await prisma.tenantUser.count({ where: { tenantId, roleId: id } });
    if (assignedUserCount > 0) {
      throw new ConflictError('Kullanicilara atanmis rol silinemez. Once rol atamalarini kaldirin.');
    }

    await prisma.role.delete({ where: { id } });
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'roles',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.DELETE,
      oldValues: { id, name: existing.name, description: existing.description },
      ...getRequestMeta(c),
    });
    return c.json({ data: { success: true } });
  },

  // ── Permissions ──────────────────────────────

  async addPermission(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const roleId = requireParam(c, 'id');

    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) return c.json(new NotFoundError('Rol', roleId).toJSON(), 404);

    if (role.isSystem) {
      return c.json(new ValidationError('Sistem rollerinin izinleri degistirilemez.').toJSON(), 400);
    }

    const body = getValidatedBody(c, addRolePermissionBodySchema);

    let permission;
    try {
      permission = await prisma.rolePermission.create({ data: { roleId, ...body } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Bu izin role zaten eklenmis.');
      }
      throw error;
    }

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'roles',
      entityType: EntityType.OTHER,
      entityId: roleId,
      action: AuditAction.UPDATE,
      newValues: { permissionId: permission.id, module: permission.module, action: permission.action },
      ...getRequestMeta(c),
    });

    return c.json({ data: permission }, 201);
  },

  async removePermission(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const roleId = requireParam(c, 'id');
    const permissionId = requireParam(c, 'permissionId');

    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) return c.json(new NotFoundError('Rol', roleId).toJSON(), 404);

    if (role.isSystem) {
      return c.json(new ValidationError('Sistem rollerinin izinleri degistirilemez.').toJSON(), 400);
    }

    const permission = await prisma.rolePermission.findFirst({
      where: { id: permissionId, roleId },
    });
    if (!permission) return c.json(new NotFoundError('İzin', permissionId).toJSON(), 404);

    await prisma.rolePermission.delete({ where: { id: permissionId } });
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'roles',
      entityType: EntityType.OTHER,
      entityId: roleId,
      action: AuditAction.UPDATE,
      oldValues: { permissionId: permission.id, module: permission.module, action: permission.action },
      ...getRequestMeta(c),
    });
    return c.json({ data: { success: true } });
  },
};
