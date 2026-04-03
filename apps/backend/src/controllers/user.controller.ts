import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

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
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const tenantUsers = await prisma.tenantUser.findMany({
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
    });

    return c.json({ data: tenantUsers });
  },

  /**
   * GET /api/users/:id
   * Belirli bir kullanıcıyı döner.
   */
  async getById(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const userId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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
    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        phone: body.phone ?? null,
        password: body.password, // Hash işlemi auth service'de yapılmalı
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

    return c.json({ data: newUser }, 201);
  },

  /**
   * PATCH /api/users/:id
   * Kullanıcı bilgilerini günceller.
   */
  async update(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const userId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const userId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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

    return c.json({ data: { success: true } });
  },
};
