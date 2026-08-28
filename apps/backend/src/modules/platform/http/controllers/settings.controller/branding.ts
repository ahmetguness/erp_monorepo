import { randomUUID } from 'crypto';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { bufferToArrayBuffer,storageService } from '../../../../../services/storage.service.js';
import { enforceFileSecurity,persistWithObject } from '../../../../shared/index.js';
import { requireTenantId } from '../../../../../utils/context.js';
import { LEGACY_TENANT_LOGO_SETTING_KEY,TENANT_LOGO_SETTING_KEY,validateLogoFile } from './shared.js';

export const brandingSettingsController = {
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
    await enforceFileSecurity({ body: buffer, fileName: fileValue.name, contentType: mimeType });
    const setting = await persistWithObject(storageService, { key: storagePath, body: buffer, contentType: mimeType }, () => prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
      create: { tenantId, key: TENANT_LOGO_SETTING_KEY, value: storagePath },
      update: { value: storagePath },
    }));

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
} as const;
