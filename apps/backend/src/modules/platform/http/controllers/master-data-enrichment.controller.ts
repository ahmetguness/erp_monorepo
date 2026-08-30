import type { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { requireTenantId } from '../../../../utils/context.js';
import { masterDataEnrichmentSchema } from '../../application/master-data-enrichment/index.js';
import { HttpCompanyRegistryAdapter } from '../../infrastructure/integrations/http-company-registry.adapter.js';
import { MasterDataEnrichmentService } from '../../infrastructure/persistence/master-data-enrichment.service.js';

export { bankAccountMasterDataEnrichmentSchema, contactMasterDataEnrichmentSchema, productMasterDataEnrichmentSchema } from '../../application/master-data-enrichment/index.js';

export const MasterDataEnrichmentController = {
  async preview(c: Context): Promise<Response> {
    const input = getValidatedBody(c, masterDataEnrichmentSchema);
    const result = await new MasterDataEnrichmentService(prisma, new HttpCompanyRegistryAdapter()).preview(requireTenantId(c), input);
    return c.json({ data: result });
  },
};
