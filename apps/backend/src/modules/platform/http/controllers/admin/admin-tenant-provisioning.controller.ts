import type { Context } from 'hono';
import { ValidationError } from '../../../../../errors/index.js';
import { requireParam } from '../../../../../utils/context.js';
import { createTenantProvisioning, getTenantProvisioning, listTenantProvisioning, previewTenantProvisioning, retryTenantProvisioning } from '../../../tenant-provisioning/tenant-provisioning.service.js';
import { idempotencyKeySchema, tenantProvisioningInputSchema } from '../../../tenant-provisioning/tenant-provisioning.schemas.js';

async function parseInput(c: Context) {
  const parsed = tenantProvisioningInputSchema.safeParse(await c.req.json<unknown>().catch(() => null));
  if (!parsed.success) throw new ValidationError('Tenant kurulum bilgileri geçersiz.');
  return parsed.data;
}

export const AdminTenantProvisioningController = {
  async list(c: Context): Promise<Response> {
    c.header('Cache-Control', 'no-store');
    return c.json({ data: await listTenantProvisioning() });
  },
  async preview(c: Context): Promise<Response> {
    return c.json({ data: await previewTenantProvisioning(await parseInput(c)) });
  },
  async create(c: Context): Promise<Response> {
    const key = idempotencyKeySchema.safeParse(c.req.header('Idempotency-Key'));
    if (!key.success) return c.json(new ValidationError('Geçerli Idempotency-Key başlığı zorunludur.').toJSON(), 400);
    const job = await createTenantProvisioning(await parseInput(c), key.data, c.get('adminId'));
    return c.json({ data: job }, job.status === 'SUCCEEDED' ? 201 : 202);
  },
  async get(c: Context): Promise<Response> {
    c.header('Cache-Control', 'no-store');
    return c.json({ data: await getTenantProvisioning(requireParam(c, 'jobId')) });
  },
  async retry(c: Context): Promise<Response> {
    return c.json({ data: await retryTenantProvisioning(requireParam(c, 'jobId'), c.get('adminId')) });
  },
};
