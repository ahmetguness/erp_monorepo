import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ValidationError, ForbiddenError, NotFoundError } from '../errors';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'axon-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface LoginDTO {
  email: string;
  password: string;
  tenantSlug?: string;
}

interface RegisterDTO {
  email: string;
  name: string;
  password: string;
  companyName: string;
  phone?: string;
}

interface JwtPayload {
  userId: string;
  tenantId: string;
  iat?: number;
  exp?: number;
}

// ─────────────────────────────────────────────
// Auth Controller
// ─────────────────────────────────────────────

export const AuthController = {
  /**
   * POST /api/auth/login
   * Email + password ile giriş. Tenant slug opsiyonel (tek tenant varsa otomatik seçilir).
   */
  async login(c: Context): Promise<Response> {
    const body = await c.req.json<LoginDTO>();

    if (!body.email || !body.password) {
      return c.json(
        new ValidationError('email ve password zorunludur.').toJSON(),
        400,
      );
    }

    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
      include: {
        tenants: {
          where: { isActive: true },
          include: {
            tenant: {
              select: {
                id: true,
                slug: true,
                companyName: true,
                plan: true,
                status: true,
                modules: true,
                trialEndsAt: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return c.json(
        new ValidationError('E-posta veya şifre hatalı.').toJSON(),
        401,
      );
    }

    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(body.password, user.password);
    if (!isPasswordValid) {
      return c.json(
        new ValidationError('E-posta veya şifre hatalı.').toJSON(),
        401,
      );
    }

    // Tenant seç
    if (user.tenants.length === 0) {
      return c.json(
        new ForbiddenError('Bu kullanıcıya ait aktif tenant bulunamadı.').toJSON(),
        403,
      );
    }

    let selectedTenantUser = user.tenants[0];

    if (body.tenantSlug) {
      const found = user.tenants.find((tu) => tu.tenant.slug === body.tenantSlug);
      if (!found) {
        return c.json(
          new NotFoundError('Tenant', body.tenantSlug).toJSON(),
          404,
        );
      }
      selectedTenantUser = found;
    }

    const tenant = selectedTenantUser.tenant;

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      return c.json(
        new ForbiddenError('Bu tenant hesabı askıya alınmış veya iptal edilmiş.').toJSON(),
        403,
      );
    }

    // JWT oluştur
    const payload: JwtPayload = {
      userId: user.id,
      tenantId: tenant.id,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    // lastLoginAt güncelle
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return c.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          isActive: user.isActive,
        },
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          companyName: tenant.companyName,
          plan: tenant.plan,
          status: tenant.status,
          modules: tenant.modules,
          trialEndsAt: tenant.trialEndsAt,
        },
        // Birden fazla tenant varsa listeyi de döndür
        availableTenants: user.tenants.map((tu) => ({
          id: tu.tenant.id,
          slug: tu.tenant.slug,
          companyName: tu.tenant.companyName,
          plan: tu.tenant.plan,
        })),
      },
    });
  },

  /**
   * POST /api/auth/register
   * Yeni kullanıcı + tenant oluşturur (self-service kayıt).
   */
  async register(c: Context): Promise<Response> {
    const body = await c.req.json<RegisterDTO>();

    if (!body.email || !body.name || !body.password || !body.companyName) {
      return c.json(
        new ValidationError('email, name, password ve companyName zorunludur.').toJSON(),
        400,
      );
    }

    if (body.password.length < 8) {
      return c.json(
        new ValidationError('Şifre en az 8 karakter olmalıdır.').toJSON(),
        400,
      );
    }

    // Email benzersizlik kontrolü
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });

    if (existingUser) {
      return c.json(
        new ValidationError('Bu e-posta adresi zaten kullanımda.').toJSON(),
        400,
      );
    }

    const hashedPassword = await bcrypt.hash(body.password, 12);

    // Slug oluştur
    const baseSlug = body.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    const existingTenant = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
    const slug = existingTenant ? `${baseSlug}-${Date.now()}` : baseSlug;

    // Transaction: user + tenant + tenantUser
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: body.email.toLowerCase().trim(),
          name: body.name,
          phone: body.phone ?? null,
          password: hashedPassword,
        },
      });

      const newTenant = await tx.tenant.create({
        data: {
          slug,
          companyName: body.companyName,
          email: body.email.toLowerCase().trim(),
          plan: 'STARTER',
          status: 'TRIAL',
          modules: [],
        },
      });

      await tx.tenantUser.create({
        data: {
          tenantId: newTenant.id,
          userId: newUser.id,
          isOwner: true,
          isActive: true,
        },
      });

      return { user: newUser, tenant: newTenant };
    });

    const payload: JwtPayload = {
      userId: result.user.id,
      tenantId: result.tenant.id,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    return c.json(
      {
        data: {
          token,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            phone: result.user.phone,
            isActive: result.user.isActive,
          },
          tenant: {
            id: result.tenant.id,
            slug: result.tenant.slug,
            companyName: result.tenant.companyName,
            plan: result.tenant.plan,
            status: result.tenant.status,
            modules: result.tenant.modules,
            trialEndsAt: result.tenant.trialEndsAt,
          },
        },
      },
      201,
    );
  },

  /**
   * GET /api/auth/me
   * JWT'den mevcut kullanıcı + tenant bilgisini döner.
   */
  async me(c: Context): Promise<Response> {
    const authHeader = c.req.header('Authorization');
    const tenantId = c.req.header('x-tenant-id');

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(new ForbiddenError('Token bulunamadı.').toJSON(), 401);
    }

    const token = authHeader.slice(7);

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş token.').toJSON(), 401);
    }

    const resolvedTenantId = tenantId ?? payload.tenantId;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return c.json(new ForbiddenError('Kullanıcı bulunamadı veya pasif.').toJSON(), 401);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: resolvedTenantId },
      select: {
        id: true,
        slug: true,
        companyName: true,
        plan: true,
        status: true,
        modules: true,
        trialEndsAt: true,
      },
    });

    if (!tenant) {
      return c.json(new NotFoundError('Tenant', resolvedTenantId).toJSON(), 404);
    }

    return c.json({ data: { user, tenant } });
  },
};
