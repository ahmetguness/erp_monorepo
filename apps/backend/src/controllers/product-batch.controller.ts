import { Context } from 'hono';
import { requireTenantId, requireParam } from '../utils/context.js';
import {
  createProductBatch,
  listProductBatches,
  updateProductBatch,
} from '../services/product-batch.service.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface ProductBatchListQuery {
  page?: string;
  limit?: string;
  productId?: string;
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
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const result = await listProductBatches({ tenantId, page, pageSize, productId: query.productId });

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
