import { AppModule,EntityType,FeatureKey,FeatureType,Plan,Prisma,TenantStatus } from '@prisma/client';
import { Context } from 'hono';
import { ValidationError } from '../../../../../errors/index.js';
import { logger } from '../../../../../lib/logger.js';
import { prisma } from '../../../../../lib/prisma.js';
import { PlanChangeExperienceService } from '../../../../../services/plan-change-experience.service.js';
import { PlanFeatureService } from '../../../../../services/plan-feature.service.js';
import { getRequestMeta } from '../../../../../utils/audit.js';
import { getTrustedClientIp } from '../../../../../utils/request-ip.js';
import { toAppModule,VALID_MODULE_KEYS } from '../../../../../utils/tenant-modules.js';

export const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

export const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (!ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET ortam değişkeni zorunludur.');
}
export const RESOLVED_ADMIN_SECRET = ADMIN_JWT_SECRET;

export const ADMIN_COOKIE_NAME = 'axon_admin_token';
export const ADMIN_REFRESH_COOKIE_NAME = 'axon_admin_refresh';
export const ADMIN_COOKIE_MAX_AGE = 15 * 60;
export const ADMIN_LOGIN_LIMIT = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_LOCKOUT_FAILURES = 10;
export const ADMIN_LOGIN_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;

export const VALID_PLANS = Object.values(Plan);
export const VALID_STATUSES = Object.values(TenantStatus);
export const VALID_FEATURE_KEYS: readonly string[] = Object.values(FeatureKey);
export const VALID_FEATURE_TYPES: readonly string[] = Object.values(FeatureType);
export const VALID_MODULES = VALID_MODULE_KEYS;
export const planFeatureService = new PlanFeatureService(prisma);
export const planChangeExperienceService = new PlanChangeExperienceService(prisma);

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function getClientIp(c: Context): string {
  return getTrustedClientIp(c);
}

export function getAdminLoginLimitKeys(ip: string, email: string): {
  ipAttemptKey: string;
  emailAttemptKey: string;
  ipFailureKey: string;
} {
  return {
    ipAttemptKey: `admin-login:ip:${ip}`,
    emailAttemptKey: `admin-login:email:${email}`,
    ipFailureKey: `admin-login-failed:ip:${ip}`,
  };
}

export function recordAdminLoginFailure(c: Context, email: string, reason: 'invalid_admin' | 'invalid_password' | 'ip_locked'): void {
  const meta = getRequestMeta(c);
  logger.warn('[AdminAudit] Admin login başarısız', {
    email,
    reason,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export function isFeatureKey(value: string): value is FeatureKey {
  return VALID_FEATURE_KEYS.includes(value);
}

export function isPlan(value: string): value is Plan {
  return (VALID_PLANS as readonly string[]).includes(value);
}

export function isFeatureType(value: string): value is FeatureType {
  return VALID_FEATURE_TYPES.includes(value);
}

export function createSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug || `tenant-${Date.now()}`;
}

export function parseNullableDate(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} için geçerli bir tarih giriniz.`);
  return date;
}

export function validateModules(modules: string[] | undefined): AppModule[] | undefined {
  if (modules === undefined) return undefined;
  if (!Array.isArray(modules)) throw new ValidationError('modules alanı liste olmalıdır.');

  const uniqueModules = Array.from(new Set(modules.map((module) => module.trim().toLowerCase()).filter(Boolean)));
  const invalidModules = uniqueModules.filter((module) => !(VALID_MODULES as readonly string[]).includes(module));
  if (invalidModules.length > 0) {
    throw new ValidationError(`Geçersiz modül: ${invalidModules.join(', ')}`);
  }
  return uniqueModules.map((module) => {
    const appModule = toAppModule(module);
    if (!appModule) throw new ValidationError(`Geçersiz modül: ${module}`);
    return appModule;
  });
}

export function normalizePlanFeatureValue(type: FeatureType, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError('value bos olamaz.');

  if (type === FeatureType.BOOLEAN) {
    const lower = normalized.toLowerCase();
    if (lower !== 'true' && lower !== 'false') {
      throw new ValidationError('BOOLEAN feature value true veya false olmalidir.');
    }
    return lower;
  }

  if (type === FeatureType.LIMIT) {
    const lower = normalized.toLowerCase();
    if (lower === 'unlimited') return lower;
    const numericValue = Number(normalized);
    if (!Number.isInteger(numericValue) || numericValue < 0) {
      throw new ValidationError('LIMIT feature value pozitif tam sayi, 0 veya unlimited olmalidir.');
    }
  }

  return normalized;
}

export async function getPlanFeatureAuditTenantIds(plan: Plan): Promise<string[]> {
  const impactedTenants = await prisma.tenant.findMany({
    where: { plan, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (impactedTenants.length > 0) return impactedTenants.map((tenant) => tenant.id);

  const fallbackTenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return fallbackTenant ? [fallbackTenant.id] : [];
}

export function formatNotificationValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'boş';
  if (value instanceof Date) return value.toLocaleDateString('tr-TR');
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'boş';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

export const MODULE_TRANSLATIONS: Record<string, string> = {
  accounting: 'Muhasebe',
  inventory: 'Stok & Depo',
  crm: 'CRM',
  sales: 'Satış',
  purchasing: 'Satın Alma',
  warehouse: 'Depo Yönetimi',
  production: 'Üretim',
  service: 'Teknik Servis',
  hr: 'İnsan Kaynakları',
  payroll: 'Bordro',
  marketplace: 'Pazaryeri',
  reporting: 'Raporlama',
  contacts: 'Cari Hesaplar',
  invoicing: 'Fatura',
  approvals: 'Onay Akışları',
};

export function translateModules(modules: unknown): unknown {
  if (Array.isArray(modules)) {
    return modules.map(m => MODULE_TRANSLATIONS[m as string] || m);
  }
  return modules;
}

export function buildChangeLine(label: string, oldValue: unknown, newValue: unknown): string | null {
  const oldText = formatNotificationValue(oldValue);
  const newText = formatNotificationValue(newValue);
  if (oldText === newText) return null;
  return `${label}: ${oldText} → ${newText}`;
}

export async function notifyTenantOwners(
  db: typeof prisma | Prisma.TransactionClient,
  tenantId: string,
  title: string,
  changeLines: string[],
): Promise<void> {
  try {
    const owners = await db.tenantUser.findMany({
      where: { tenantId, isOwner: true, isActive: true },
      select: { userId: true },
    });
    if (owners.length === 0 || changeLines.length === 0) return;

    await db.notification.createMany({
      data: owners.map((owner) => ({
        tenantId,
        userId: owner.userId,
        title,
        message: changeLines.join('\n'),
        module: 'admin',
        entityType: EntityType.OTHER,
        entityId: tenantId,
      })),
    });
  } catch {
    // Bildirim hatası admin işlemini durdurmamalı.
  }
}

// ─────────────────────────────────────────────
// Admin Auth
// ─────────────────────────────────────────────
