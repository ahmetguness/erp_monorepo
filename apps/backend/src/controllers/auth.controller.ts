import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { prisma } from '../lib/prisma';
import { ValidationError, ForbiddenError, NotFoundError } from '../errors';
import { PermissionAction, Prisma } from '@prisma/client';
import { requireTenantId } from '../utils/context.js';
import { logger } from '../lib/logger';
import { rateLimiter } from '../lib/rateLimiter';
import {
  createSecuritySession,
  revokeSecuritySession,
  type RequestSecurityMeta,
} from '../services/security-hardening.service.js';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

const RESOLVED_JWT_SECRET = JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const AUTH_COOKIE_NAME = 'axon_token';
const REMEMBER_ME_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_IP_LIMIT = 10;
const LOGIN_EMAIL_LIMIT = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// ─────────────────────────────────────────────
// Rate limiter (register + login brute force koruması)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface LoginDTO {
  email: string;
  password: string;
  tenantSlug?: string;
  rememberMe?: boolean;
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
  sessionId?: string;
  iat?: number;
  exp?: number;
}

interface TenantMembershipView {
  isOwner: boolean;
  roleId: string | null;
  role: {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: Array<{ module: string; action: string }>;
  } | null;
}

function toTenantMembershipView(input: {
  isOwner: boolean;
  roleId: string | null;
  roleRef?: {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: Array<{ module: string; action: PermissionAction }>;
  } | null;
}): TenantMembershipView {
  return {
    isOwner: input.isOwner,
    roleId: input.roleId,
    role: input.roleRef
      ? {
          id: input.roleRef.id,
          name: input.roleRef.name,
          isSystem: input.roleRef.isSystem,
          permissions: input.roleRef.permissions.map((permission) => ({
            module: permission.module,
            action: permission.action,
          })),
        }
      : null,
  };
}

function setAuthCookie(c: Context, token: string, rememberMe = true): void {
  setCookie(c, AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    ...(rememberMe ? { maxAge: REMEMBER_ME_MAX_AGE_SECONDS } : {}),
  });
}

function clearAuthCookie(c: Context): void {
  deleteCookie(c, AUTH_COOKIE_NAME, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
  });
}

function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip')?.trim() || 'unknown';
}

function getAuthRequestMeta(c: Context): RequestSecurityMeta {
  return {
    ipAddress: getClientIp(c),
    userAgent: c.req.header('user-agent') ?? null,
  };
}

function getTokenPayloadFromRequest(c: Context): JwtPayload | null {
  const auth = c.req.header('Authorization');
  const cookieToken = getCookie(c, AUTH_COOKIE_NAME);
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : cookieToken;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, RESOLVED_JWT_SECRET);
    if (typeof payload === 'string') return null;
    if (typeof payload.userId !== 'string' || typeof payload.tenantId !== 'string') return null;
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function validatePasswordPolicy(password: string): ValidationError | null {
  if (password.length < 10) return new ValidationError('Sifre en az 10 karakter olmalidir.');
  if (!/[a-z]/.test(password)) return new ValidationError('Sifre en az bir kucuk harf icermelidir.');
  if (!/[A-Z]/.test(password)) return new ValidationError('Sifre en az bir buyuk harf icermelidir.');
  if (!/[0-9]/.test(password)) return new ValidationError('Sifre en az bir rakam icermelidir.');
  return null;
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
    const ip = getClientIp(c);
    if (await rateLimiter.check(`login:${ip}`, LOGIN_IP_LIMIT, LOGIN_LOCKOUT_WINDOW_MS)) {
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
    const normalizedEmail = normalizeEmail(body.email);
    const emailLockKey = `login_email:${normalizedEmail}`;
    if (await rateLimiter.check(emailLockKey, LOGIN_EMAIL_LIMIT, LOGIN_LOCKOUT_WINDOW_MS)) {
      return c.json({ error: { code: 'ACCOUNT_LOCKED', message: 'Bu hesap icin cok fazla basarisiz giris denemesi var. Lutfen 15 dakika sonra tekrar deneyin.' } }, 429);
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        tenants: {
          where: { isActive: true },
          include: {
            roleRef: {
              select: {
                id: true,
                name: true,
                isSystem: true,
                permissions: { select: { module: true, action: true } },
              },
            },
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
      logger.warn(`[Auth] Login başarısız — kullanıcı bulunamadı: ${body.email}`);
      return c.json(
        new ValidationError('E-posta veya şifre hatalı.').toJSON(),
        401,
      );
    }

    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(body.password, user.password);
    if (!isPasswordValid) {
      logger.warn(`[Auth] Login başarısız — yanlış şifre: ${body.email}`);
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
    const session = await createSecuritySession(prisma, tenant.id, user.id, getAuthRequestMeta(c));
    const payload: JwtPayload = {
      userId: user.id,
      tenantId: tenant.id,
      sessionId: session.id,
    };

    const token = jwt.sign(payload, RESOLVED_JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    setAuthCookie(c, token, body.rememberMe ?? true);

    // lastLoginAt güncelle
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await Promise.all([
      rateLimiter.reset(`login:${ip}`),
      rateLimiter.reset(emailLockKey),
    ]);

    return c.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          isActive: user.isActive,
          tenantMembership: toTenantMembershipView(selectedTenantUser),
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
    if (await rateLimiter.check(`register:${ip}`, 5, 15 * 60 * 1000)) {
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Çok fazla kayıt denemesi. Lütfen 15 dakika sonra tekrar deneyin.' } }, 429);
    }

    const body = await c.req.json<RegisterDTO>();

    if (!body.email || !body.name || !body.password || !body.companyName) {
      return c.json(
        new ValidationError('email, name, password ve companyName zorunludur.').toJSON(),
        400,
      );
    }

    const passwordPolicyError = validatePasswordPolicy(body.password);
    if (passwordPolicyError) return c.json(passwordPolicyError.toJSON(), 400);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizeEmail(body.email) },
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

    const session = await createSecuritySession(prisma, result.tenant.id, result.user.id, getAuthRequestMeta(c));
    const payload: JwtPayload = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      sessionId: session.id,
    };

    const token = jwt.sign(payload, RESOLVED_JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    setAuthCookie(c, token, true);

    return c.json(
      {
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            phone: result.user.phone,
            isActive: result.user.isActive,
            tenantMembership: { isOwner: true, roleId: null, role: null },
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
   * POST /api/auth/logout
   * HttpOnly auth cookie'sini temizler.
   */
  async logout(c: Context): Promise<Response> {
    const payload = getTokenPayloadFromRequest(c);
    if (payload?.sessionId) {
      await revokeSecuritySession(prisma, payload.tenantId, payload.sessionId, payload.userId, getAuthRequestMeta(c));
    }
    clearAuthCookie(c);
    return c.json({ data: { success: true } });
  },

  /**
   * GET /api/auth/me
   * JWT'den mevcut kullanıcı + tenant bilgisini döner.
   */
  async me(c: Context): Promise<Response> {
    // userId ve tenantId artık requireAuth middleware'inden geliyor
    const userId = c.get('userId') as string;
    const tenantId = requireTenantId(c);

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
        preferences: true,
        isOwner: true,
        roleId: true,
        roleRef: {
          select: {
            id: true,
            name: true,
            isSystem: true,
            permissions: { select: { module: true, action: true } },
          },
        },
      }
    });

    return c.json({
      data: {
        user: {
          ...user,
          tenantMembership: tenantUser ? toTenantMembershipView(tenantUser) : undefined,
        },
        tenant,
        preferences: tenantUser?.preferences || null,
      },
    });
  },

  /**
   * PATCH /api/auth/me/preferences
   * Kullanıcının o anki tenant'a ait ayarlarını (ör: dashboard layout) günceller.
   */
  async updatePreferences(c: Context): Promise<Response> {
    const userId = c.get('userId') as string;
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ preferences: Prisma.InputJsonObject }>();

    const tenantUser = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!tenantUser) {
      return c.json(new NotFoundError('Kullanıcı', userId).toJSON(), 404);
    }

    // JSON birleştirme: Mevcut preferences ile yeni gelen preferences
    const currentPrefs = (tenantUser.preferences as Prisma.JsonObject) || {};
    const newPrefs: Prisma.InputJsonObject = { ...currentPrefs, ...body.preferences };

    const updated = await prisma.tenantUser.update({
      where: { id: tenantUser.id },
      data: { preferences: newPrefs },
      select: { preferences: true },
    });

    return c.json({ data: updated });
  },
};
