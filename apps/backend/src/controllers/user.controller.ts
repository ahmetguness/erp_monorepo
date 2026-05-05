import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { requireTenantId } from '../utils/context.js';
import { getPaginationParams } from '../utils/pagination.js';
import { logger } from '../lib/logger';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateUserDTO {
  email: string;
  name: string;
  phone?: string;
  password: string;
  roleId?: string;
}

interface UpdateUserDTO {
  name?: string;
  phone?: string;
  isActive?: boolean;
  roleId?: string;
}

// ─────────────────────────────────────────────
// User Controller
// Kullanıcı CRUD işlemleri — limit kontrolü middleware'de yapılır
// ─────────────────────────────────────────────

export const UserController = {
  /**
   * GET /api/users
   * Tenant'a ait tüm kullanıcıları listeler.
   */
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 50);

    const [total, tenantUsers] = await prisma.$transaction([
      prisma.tenantUser.count({ where: { tenantId } }),
      prisma.tenantUser.findMany({
        where: { tenantId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              phone: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
          roleRef: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return c.json({ data: tenantUsers, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  /**
   * GET /api/users/:id
   * Belirli bir kullanıcıyı döner.
   */
  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.req.param('id');

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        roleRef: {
          select: { id: true, name: true },
        },
      },
    });

    if (!tenantUser) {
      return c.json(new NotFoundError('Kullanıcı', userId).toJSON(), 404);
    }

    return c.json({ data: tenantUser });
  },

  /**
   * POST /api/users
   * Yeni kullanıcı oluşturur.
   * NOT: Kullanıcı limiti enforceStarterLimits('user') middleware'inde kontrol edilir.
   */
  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);

    const body = await c.req.json<CreateUserDTO>();

    if (!body.email || !body.name || !body.password) {
      return c.json(
        new ValidationError('email, name ve password alanları zorunludur.', {
          email: !body.email ? 'Zorunlu alan' : '',
          name: !body.name ? 'Zorunlu alan' : '',
          password: !body.password ? 'Zorunlu alan' : '',
        }).toJSON(),
        400,
      );
    }

    // Email benzersizlik kontrolü
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      // Kullanıcı zaten var → tenant'a ekle (eğer eklenmemişse)
      const existingTenantUser = await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId, userId: existingUser.id } },
      });

      if (existingTenantUser) {
        return c.json(
          new ValidationError('Bu kullanıcı zaten tenant üyesi.').toJSON(),
          400,
        );
      }

      const tenantUser = await prisma.tenantUser.create({
        data: {
          tenantId,
          userId: existingUser.id,
          roleId: body.roleId ?? null,
          isActive: true,
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      return c.json({ data: tenantUser }, 201);
    }

    // Yeni kullanıcı oluştur
    const hashedPassword = await bcrypt.hash(body.password, 12);

    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        phone: body.phone ?? null,
        password: hashedPassword,
        tenants: {
          create: {
            tenantId,
            roleId: body.roleId ?? null,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    logger.info(`[User] Yeni kullanıcı oluşturuldu: ${newUser.email} (tenant: ${tenantId})`);

    await createAuditLog(prisma, {
      tenantId, userId, module: 'users',
      entityType: EntityType.OTHER, entityId: newUser.id,
      action: AuditAction.CREATE,
      newValues: { email: newUser.email, name: newUser.name },
      ipAddress, userAgent,
    });

    return c.json({ data: newUser }, 201);
  },

  /**
   * PATCH /api/users/:id
   */
  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.req.param('id');

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, userId },
    });

    if (!tenantUser) {
      return c.json(new NotFoundError('Kullanıcı', userId).toJSON(), 404);
    }

    const body = await c.req.json<UpdateUserDTO>();

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
        select: { id: true, email: true, name: true, phone: true, isActive: true },
      }),
      prisma.tenantUser.update({
        where: { id: tenantUser.id },
        data: {
          ...(body.roleId !== undefined && { roleId: body.roleId }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      }),
    ]);

    return c.json({ data: updatedUser });
  },

  /**
   * DELETE /api/users/:id
   * Kullanıcıyı tenant'tan çıkarır (soft deactivate).
   */
  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.req.param('id');
    const actorId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, userId },
    });

    if (!tenantUser) {
      return c.json(new NotFoundError('Kullanıcı', userId).toJSON(), 404);
    }

    if (tenantUser.isOwner) {
      return c.json(
        new ForbiddenError('Tenant sahibi silinemez.').toJSON(),
        403,
      );
    }

    await prisma.tenantUser.update({
      where: { id: tenantUser.id },
      data: { isActive: false },
    });

    await createAuditLog(prisma, {
      tenantId, userId: actorId, module: 'users',
      entityType: EntityType.OTHER, entityId: userId!,
      action: AuditAction.DELETE,
      oldValues: { isActive: true },
      newValues: { isActive: false },
      ipAddress, userAgent,
    });

    return c.json({ data: { success: true } });
  },
};
