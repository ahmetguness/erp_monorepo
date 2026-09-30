import { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import {
createProductBatch,
listProductBatches,
updateProductBatch,
} from '../../../../services/product-batch.service.js';
import { requireParam,requireTenantId } from '../../../../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface ProductBatchListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  search?: string;
  status?: 'all' | 'active' | 'empty' | 'expiring' | 'expired' | 'noExpiry';
}

interface CreateProductBatchDTO {
  productId: string;
  batchNumber: string;
  expiryDate?: string;
  manufacturedAt?: string;
  quantity?: number;
  notes?: string;
}

interface UpdateProductBatchDTO {
  expiryDate?: string;
  manufacturedAt?: string;
  quantity?: number;
  notes?: string;
}

// ─────────────────────────────────────────────
// Product Batch Controller
// ─────────────────────────────────────────────

export const ProductBatchController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ProductBatchListQuery;
    const integer = (value: string | undefined, fallback: number, maximum: number, field: string) => {
      if (value === undefined) return fallback;
      if (!/^\d+$/.test(value)) throw new ValidationError(`${field} pozitif bir tam sayi olmalidir.`);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum)
        throw new ValidationError(`${field} 1-${maximum} araliginda olmalidir.`);
      return parsed;
    };
    const page = integer(query.page, 1, 100_000, 'page');
    const pageSize = integer(query.limit, 20, 100, 'limit');
    if (query.status && !['all', 'active', 'empty', 'expiring', 'expired', 'noExpiry'].includes(query.status))
      throw new ValidationError('Gecersiz parti durumu.');
    const search = query.search?.trim();
    if (search && search.length > 100) throw new ValidationError('search en fazla 100 karakter olabilir.');
    const result = await listProductBatches({ tenantId, page, pageSize, productId: query.productId, search, status: query.status });

    return c.json(result);
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateProductBatchDTO>();

    const batch = await createProductBatch({ tenantId, ...body });

    return c.json({ data: batch }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const body = await c.req.json<UpdateProductBatchDTO>();
    const updated = await updateProductBatch({ tenantId, id, ...body });

    return c.json({ data: updated });
  },
};
