import { Context } from 'hono';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getValidatedBody } from '../middleware/validateBody';
import {
  businessRuleBodySchema,
  moduleSettingBodySchema,
  tenantSettingBodySchema,
} from '../schemas/request-body.schemas';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { AuditAction, EntityType, Plan } from '@prisma/client';
import { bufferToArrayBuffer, storageService } from '../services/storage.service.js';
import { BusinessRulesService } from '../services/business-rules.service.js';
import { getTenantSecurityScore } from '../services/tenant-security.service.js';
import {
  getSecurityHardeningSnapshot,
  listSecuritySessions,
  revokeSecuritySession,
} from '../services/security-hardening.service.js';

const TENANT_LOGO_SETTING_KEY = 'tenant_logo_storage_path';
const LEGACY_TENANT_LOGO_SETTING_KEY = 'company_logo';
const TENANT_LOGO_SETTING_KEYS = [TENANT_LOGO_SETTING_KEY, LEGACY_TENANT_LOGO_SETTING_KEY] as const;
const INTERNAL_TENANT_SETTING_KEYS = [...TENANT_LOGO_SETTING_KEYS, 'security.sessions'] as const;
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_LOGO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const businessRulesService = new BusinessRulesService(prisma);

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(c: Context): Promise<JsonObject> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ValidationError('Gecersiz JSON govdesi.');
  }

  if (!isJsonObject(value)) {
    throw new ValidationError('JSON govdesi nesne olmalidir.');
  }

  return value;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

async function assertEnterpriseTenant(tenantId: string, message: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });

  if (tenant?.plan !== Plan.ENTERPRISE) {
    throw new ValidationError(message);
  }
}

function isInternalTenantSettingKey(key: string | undefined): boolean {
  return typeof key === 'string' && INTERNAL_TENANT_SETTING_KEYS.some((internalKey) => internalKey === key);
}

function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[^\w.\- ]/g, '_').slice(0, 180) || 'logo';
}

function validateLogoFile(file: File): { extension: string; mimeType: string } {
  const safeName = sanitizeFileName(file.name);
  const extension = extname(safeName).toLowerCase();
  const mimeType = file.type || 'application/octet-stream';

  if (file.size <= 0) throw new ValidationError('Boş logo yüklenemez.');
  if (file.size > MAX_LOGO_SIZE) throw new ValidationError('Logo boyutu 2MB sınırını aşamaz.');
  if (!ALLOWED_LOGO_EXTENSIONS.has(extension) || !ALLOWED_LOGO_MIME_TYPES.has(mimeType)) {
    throw new ValidationError('Logo için JPG, PNG veya WebP dosyası yükleyin.');
  }

  return { extension, mimeType };
}

// ─────────────────────────────────────────────
// Settings Controller
// TenantSetting + ModuleSetting CRUD
// ─────────────────────────────────────────────

export const SettingsController = {

  // ── Tenant Settings ──────────────────────────

  async listTenantSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const settings = await prisma.tenantSetting.findMany({
      where: {
        tenantId,
        key: { notIn: [...INTERNAL_TENANT_SETTING_KEYS] },
      },
      orderBy: { key: 'asc' },
    });
    return c.json({ data: settings });
  },

  async upsertTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody(c, tenantSettingBodySchema);
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }
    if (isInternalTenantSettingKey(body.key)) {
      return c.json(new ValidationError('Bu ayar sistem tarafindan yonetilir.').toJSON(), 400);
    }

    const setting = await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: body.key } },
      create: { tenantId, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },

  async deleteTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const key = c.req.param('key');
    if (isInternalTenantSettingKey(key)) {
      return c.json(new ValidationError('Bu ayar sistem tarafindan yonetilir.').toJSON(), 400);
    }

    await prisma.tenantSetting.deleteMany({ where: { tenantId, key } });
    return c.json({ data: { success: true } });
  },

  async listBusinessRules(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rules = await businessRulesService.list(tenantId);
    return c.json({ data: rules });
  },

  async securityScore(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const score = await getTenantSecurityScore(prisma, tenantId);
    return c.json({ data: score });
  },

  async securityDashboard(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const snapshot = await getSecurityHardeningSnapshot(prisma, tenantId);
    return c.json({ data: snapshot });
  },

  async listSecuritySessions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const sessions = await listSecuritySessions(prisma, tenantId);
    return c.json({ data: sessions });
  },

  async revokeSecuritySession(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const sessionId = c.req.param('sessionId');
    if (!sessionId) return c.json(new ValidationError('sessionId zorunludur.').toJSON(), 400);
    const revoked = await revokeSecuritySession(prisma, tenantId, sessionId, userId, getRequestMeta(c));
    if (!revoked) return c.json(new NotFoundError('Session', sessionId).toJSON(), 404);
    return c.json({ data: revoked });
  },

  async upsertBusinessRule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody(c, businessRuleBodySchema);
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }

    const rule = await businessRulesService.upsert(tenantId, body.key, body.value);
    return c.json({ data: rule });
  },

  // ── Module Settings ──────────────────────────

  async uploadTenantLogo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const formData = await c.req.formData();
    const fileValue = formData.get('file');

    if (!(fileValue instanceof File)) {
      return c.json(new ValidationError('file zorunludur.').toJSON(), 400);
    }

    const previous = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
    });
    const { extension, mimeType } = validateLogoFile(fileValue);
    const storagePath = `${tenantId}/tenant-logo/${randomUUID()}${extension}`;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await storageService.put({ key: storagePath, body: buffer, contentType: mimeType });

    const setting = await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
      create: { tenantId, key: TENANT_LOGO_SETTING_KEY, value: storagePath },
      update: { value: storagePath },
    });

    if (previous?.value && previous.value !== storagePath) {
      await storageService.delete(previous.value);
    }
    await prisma.tenantSetting.deleteMany({
      where: { tenantId, key: LEGACY_TENANT_LOGO_SETTING_KEY },
    });

    return c.json({ data: setting });
  },

  async downloadTenantLogo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const setting = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
    });

    if (!setting) return new Response(null, { status: 204 });

    const storedObject = await storageService.get(setting.value);
    if (!storedObject) return new Response(null, { status: 204 });

    return new Response(new Blob([bufferToArrayBuffer(storedObject.body)]), {
      headers: {
        'Content-Type': storedObject.contentType,
        'Content-Length': String(storedObject.contentLength),
        'Cache-Control': 'private, max-age=300',
      },
    });
  },

  async deleteTenantLogo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const setting = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
    });

    if (!setting) return c.json(new NotFoundError('Logo').toJSON(), 404);

    await storageService.delete(setting.value);
    await prisma.tenantSetting.delete({ where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } } });
    await prisma.tenantSetting.deleteMany({
      where: { tenantId, key: LEGACY_TENANT_LOGO_SETTING_KEY },
    });
    return c.json({ data: { success: true } });
  },
  async listModuleSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const module = c.req.query('module');
    const settings = await prisma.moduleSetting.findMany({
      where: { tenantId, ...(module && { module }) },
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
    return c.json({ data: settings });
  },

  async upsertModuleSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody(c, moduleSettingBodySchema);
    if (!body.module || !body.key || body.value === undefined) {
      return c.json(new ValidationError('module, key ve value zorunludur.').toJSON(), 400);
    }

    const setting = await prisma.moduleSetting.upsert({
      where: { tenantId_module_key: { tenantId, module: body.module, key: body.key } },
      create: { tenantId, module: body.module, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },

  async getCorporateSecuritySettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('Kurumsal güvenlik ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const settings = await prisma.tenantSetting.findMany({
      where: {
        tenantId,
        key: { startsWith: 'security.' }
      }
    });

    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    return c.json({
      data: {
        ssoEnabled: settingsMap.get('security.sso.enabled') === 'true',
        ssoProvider: settingsMap.get('security.sso.provider') || 'saml',
        samlMetadataUrl: settingsMap.get('security.sso.saml_metadata_url') || '',
        oidcClientId: settingsMap.get('security.sso.oidc_client_id') || '',
        oidcClientSecret: settingsMap.get('security.sso.oidc_client_secret') || '',
        scimEnabled: settingsMap.get('security.scim.enabled') === 'true',
        scimToken: settingsMap.get('security.scim.token') || '',
        ipRestrictionEnabled: settingsMap.get('security.ip_restriction.enabled') === 'true',
        ipWhitelist: settingsMap.get('security.ip_whitelist') || '',
        sessionMaxAgeDays: parseInt(settingsMap.get('security.session.max_age_days') || '7', 10),
        sessionConcurrentLimit: parseInt(settingsMap.get('security.session.concurrent_limit') || '5', 10),
        sessionIdleTimeoutMins: parseInt(settingsMap.get('security.session.idle_timeout_mins') || '30', 10),
      }
    });
  },

  async updateCorporateSecuritySettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('Kurumsal güvenlik ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const body = await readJsonObject(c);

    const updates = [
      { key: 'security.sso.enabled', value: readBoolean(body.ssoEnabled) ? 'true' : 'false' },
      { key: 'security.sso.provider', value: readString(body.ssoProvider, 'saml') },
      { key: 'security.sso.saml_metadata_url', value: readString(body.samlMetadataUrl) },
      { key: 'security.sso.oidc_client_id', value: readString(body.oidcClientId) },
      { key: 'security.sso.oidc_client_secret', value: readString(body.oidcClientSecret) },
      { key: 'security.scim.enabled', value: readBoolean(body.scimEnabled) ? 'true' : 'false' },
      { key: 'security.ip_restriction.enabled', value: readBoolean(body.ipRestrictionEnabled) ? 'true' : 'false' },
      { key: 'security.ip_whitelist', value: readString(body.ipWhitelist) },
      { key: 'security.session.max_age_days', value: String(readPositiveNumber(body.sessionMaxAgeDays, 7)) },
      { key: 'security.session.concurrent_limit', value: String(readPositiveNumber(body.sessionConcurrentLimit, 5)) },
      { key: 'security.session.idle_timeout_mins', value: String(readPositiveNumber(body.sessionIdleTimeoutMins, 30)) },
    ];

    for (const update of updates) {
      await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: update.key } },
        create: { tenantId, key: update.key, value: update.value },
        update: { value: update.value }
      });
    }

    return c.json({ data: { success: true } });
  },

  async generateScimToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('SCIM provizyonlama sadece Enterprise plan müşterileri içindir.');
    }

    const token = 'scim_' + randomUUID().replace(/-/g, '');

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: 'security.scim.token' } },
      create: { tenantId, key: 'security.scim.token', value: token },
      update: { value: token }
    });

    return c.json({ data: { token } });
  },

  async getBiSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('BI ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const settings = await prisma.tenantSetting.findMany({
      where: {
        tenantId,
        key: { startsWith: 'bi.' }
      }
    });

    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    const tokenSetting = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: 'security.bi.token' } }
    });

    return c.json({
      data: {
        enabled: settingsMap.get('bi.schedule.enabled') === 'true',
        interval: settingsMap.get('bi.schedule.interval') || 'daily',
        entities: settingsMap.get('bi.schedule.entities') || 'products,contacts,invoices',
        lastRun: settingsMap.get('bi.schedule.last_run') || null,
        token: tokenSetting?.value || '',
      }
    });
  },

  async updateBiSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('BI ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const body = await readJsonObject(c);

    const updates = [
      { key: 'bi.schedule.enabled', value: readBoolean(body.enabled) ? 'true' : 'false' },
      { key: 'bi.schedule.interval', value: readString(body.interval, 'daily') },
      { key: 'bi.schedule.entities', value: readString(body.entities, 'products,contacts,invoices') },
    ];

    for (const update of updates) {
      await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: update.key } },
        create: { tenantId, key: update.key, value: update.value },
        update: { value: update.value }
      });
    }

    return c.json({ data: { success: true } });
  },

  async generateBiToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('BI ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const token = 'bi_' + randomUUID().replace(/-/g, '');

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: 'security.bi.token' } },
      create: { tenantId, key: 'security.bi.token', value: token },
      update: { value: token }
    });

    return c.json({ data: { token } });
  },

  async runBiScheduleSimulation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('BI ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const now = new Date().toISOString();

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: 'bi.schedule.last_run' } },
      create: { tenantId, key: 'bi.schedule.last_run', value: now },
      update: { value: now }
    });

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'data_warehouse',
      entityType: EntityType.OTHER,
      entityId: 'bi_export_schedule',
      action: AuditAction.UPDATE,
      newValues: { status: 'success', executedAt: now },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { success: true, lastRun: now } });
  },

  async getPortalToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const contactId = requireParam(c, 'contactId');

    await assertEnterpriseTenant(tenantId, 'Musteri portali sadece Enterprise plani kapsamindadir.');

    // Verify contact belongs to tenant
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      throw new NotFoundError('Cari', contactId);
    }

    const setting = await prisma.tenantSetting.findFirst({
      where: { tenantId, key: `portal.token.${contactId}` },
      select: { value: true },
    });

    return c.json({ data: { token: setting?.value ?? null } });
  },

  async generatePortalToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const contactId = requireParam(c, 'contactId');

    await assertEnterpriseTenant(tenantId, 'Musteri portali sadece Enterprise plani kapsamindadir.');

    // Verify contact belongs to tenant
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      throw new NotFoundError('Cari', contactId);
    }

    const token = 'cpt_' + randomUUID().replace(/-/g, '');

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: `portal.token.${contactId}` } },
      create: { tenantId, key: `portal.token.${contactId}`, value: token },
      update: { value: token },
    });

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'contacts',
      entityType: EntityType.CONTACT,
      entityId: contactId,
      action: AuditAction.UPDATE,
      newValues: { portalTokenGenerated: true },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { token } });
  },
};
