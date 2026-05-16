import { Context } from 'hono';
import { AuditAction, EntityType, PermissionAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface RoleListQuery {
  page?: string;
  limit?: string;
}

interface CreateRoleDTO {
  name: string;
  description?: string;
  permissions?: Array<{
    module: string;
    action: PermissionAction;
  }>;
}

interface UpdateRoleDTO {
  name?: string;
  description?: string;
}

interface AddPermissionDTO {
  module: string;
  action: PermissionAction;
}

// ─────────────────────────────────────────────
// Role Controller
// Role, RolePermission
// ─────────────────────────────────────────────

export const RoleController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as RoleListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

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
    const id = c.req.param('id')!;

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

    const body = await c.req.json<CreateRoleDTO>();

    if (!body.name) {
      return c.json(new ValidationError('name alanı zorunludur.').toJSON(), 400);
    }

    const role = await prisma.role.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description ?? null,
        ...(body.permissions?.length && {
          permissions: {
            create: body.permissions.map((p) => ({
              module: p.module,
              action: p.action,
            })),
          },
        }),
      },
      include: { permissions: true },
    });

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
    const id = c.req.param('id')!;

    const existing = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Rol', id).toJSON(), 404);

    if (existing.isSystem) {
      return c.json(new ValidationError('Sistem rolleri düzenlenemez.').toJSON(), 400);
    }

    const body = await c.req.json<UpdateRoleDTO>();

    const updated = await prisma.role.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
      },
      include: { permissions: true },
    });

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
    const id = c.req.param('id')!;

    const existing = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Rol', id).toJSON(), 404);

    if (existing.isSystem) {
      return c.json(new ValidationError('Sistem rolleri silinemez.').toJSON(), 400);
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
    const roleId = c.req.param('id')!;

    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) return c.json(new NotFoundError('Rol', roleId).toJSON(), 404);

    const body = await c.req.json<AddPermissionDTO>();

    if (!body.module || !body.action) {
      return c.json(new ValidationError('module ve action zorunludur.').toJSON(), 400);
    }

    const permission = await prisma.rolePermission.create({
      data: {
        roleId,
        module: body.module,
        action: body.action,
      },
    });

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
    const roleId = c.req.param('id')!;
    const permissionId = c.req.param('permissionId')!;

    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) return c.json(new NotFoundError('Rol', roleId).toJSON(), 404);

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
