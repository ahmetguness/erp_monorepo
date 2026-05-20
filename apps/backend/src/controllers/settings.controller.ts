import { Context } from 'hono';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';
import { bufferToArrayBuffer, storageService } from '../services/storage.service.js';
import { BusinessRulesService } from '../services/business-rules.service.js';

const TENANT_LOGO_SETTING_KEY = 'tenant_logo_storage_path';
const LEGACY_TENANT_LOGO_SETTING_KEY = 'company_logo';
const TENANT_LOGO_SETTING_KEYS = [TENANT_LOGO_SETTING_KEY, LEGACY_TENANT_LOGO_SETTING_KEY] as const;
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_LOGO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const businessRulesService = new BusinessRulesService(prisma);

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
        key: { notIn: [...TENANT_LOGO_SETTING_KEYS] },
      },
      orderBy: { key: 'asc' },
    });
    return c.json({ data: settings });
  },

  async upsertTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ key: string; value: string }>();
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
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

    await prisma.tenantSetting.deleteMany({ where: { tenantId, key } });
    return c.json({ data: { success: true } });
  },

  async listBusinessRules(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rules = await businessRulesService.list(tenantId);
    return c.json({ data: rules });
  },

  async upsertBusinessRule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<{ key: string; value: unknown }>();
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
    await prisma.tenantSetting.delete({ where: { id: setting.id } });
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

    const body = await c.req.json<{ module: string; key: string; value: string }>();
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
};
