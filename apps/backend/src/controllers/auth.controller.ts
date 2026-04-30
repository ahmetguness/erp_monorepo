import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ValidationError, ForbiddenError, NotFoundError } from '../errors';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

// ─────────────────────────────────────────────
// Rate limiter (register + login brute force koruması)
// ─────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) return false;
  entry.count++;
  return true;
}

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
    // Rate limit: IP başına 15 dakikada max 10 giriş denemesi
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.' } }, 429);
    }

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
    // Rate limit: IP başına 15 dakikada max 5 kayıt
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000)) {
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Çok fazla kayıt denemesi. Lütfen 15 dakika sonra tekrar deneyin.' } }, 429);
    }

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
    // userId ve tenantId artık requireAuth middleware'inden geliyor
    const userId = c.get('userId') as string;
    const tenantId = c.get('tenantId') as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      where: { id: tenantId },
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
      return c.json(new NotFoundError('Tenant', tenantId).toJSON(), 404);
    }

    const tenantUser = await prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId, userId }
      },
      select: {
        preferences: true
      }
    });

    return c.json({ data: { user, tenant, preferences: tenantUser?.preferences || null } });
  },

  /**
   * PATCH /api/auth/me/preferences
   * Kullanıcının o anki tenant'a ait ayarlarını (ör: dashboard layout) günceller.
   */
  async updatePreferences(c: Context): Promise<Response> {
    const userId = c.get('userId') as string;
    const tenantId = c.get('tenantId') as string;

    const body = await c.req.json<{ preferences: Record<string, unknown> }>();

    const tenantUser = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!tenantUser) {
      return c.json(new NotFoundError('Kullanıcı', userId).toJSON(), 404);
    }

    // JSON birleştirme: Mevcut preferences ile yeni gelen preferences
    const currentPrefs = (tenantUser.preferences as Record<string, unknown>) || {};
    const newPrefs = { ...currentPrefs, ...body.preferences };

    const updated = await prisma.tenantUser.update({
      where: { id: tenantUser.id },
      data: { preferences: newPrefs },
      select: { preferences: true },
    });

    return c.json({ data: updated });
  },
};
