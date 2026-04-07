import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateProductDTO {
  code: string;
  name: string;
  unitId: string;
  categoryId?: string;
  taxRateId?: string;
  barcode?: string;
  description?: string;
  imageUrl?: string;
  purchasePrice?: number;
  salesPrice?: number;
  minStockLevel?: number;
}

interface UpdateProductDTO {
  name?: string;
  categoryId?: string;
  taxRateId?: string;
  barcode?: string;
  description?: string;
  imageUrl?: string;
  purchasePrice?: number;
  salesPrice?: number;
  minStockLevel?: number;
  isActive?: boolean;
}

interface ProductListQuery {
  page?: string;
  limit?: string;
  search?: string;
  categoryId?: string;
  isActive?: string;
}

// ─────────────────────────────────────────────
// Product Controller
// Ürün CRUD işlemleri — limit kontrolü middleware'de yapılır
// ─────────────────────────────────────────────

export const ProductController = {
  /**
   * GET /api/products
   * Tenant'a ait ürünleri listeler (sayfalama + filtreleme).
   */
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as ProductListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
          { barcode: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
    };

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, code: true } },
          taxRate: { select: { id: true, name: true, rate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: products,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  /**
   * GET /api/products/:id
   * Belirli bir ürünü döner.
   */
  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const productId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, code: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
        stockLevels: {
          include: {
            warehouse: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!product) {
      return c.json(new NotFoundError('Ürün', productId).toJSON(), 404);
    }

    return c.json({ data: product });
  },

  /**
   * POST /api/products
   * Yeni ürün oluşturur.
   * NOT: Ürün limiti enforceStarterLimits('product') middleware'inde kontrol edilir.
   */
  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateProductDTO>();

    if (!body.code || !body.name || !body.unitId) {
      return c.json(
        new ValidationError('code, name ve unitId alanları zorunludur.').toJSON(),
        400,
      );
    }

    // Kod benzersizlik kontrolü
    const existing = await prisma.product.findUnique({
      where: { tenantId_code: { tenantId, code: body.code } },
    });

    if (existing) {
      return c.json(
        new ValidationError(`"${body.code}" kodu zaten kullanımda.`).toJSON(),
        400,
      );
    }

    const product = await prisma.product.create({
      data: {
        tenantId,
        code: body.code,
        name: body.name,
        unitId: body.unitId,
        categoryId: body.categoryId ?? null,
        taxRateId: body.taxRateId ?? null,
        barcode: body.barcode ?? null,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        purchasePrice: body.purchasePrice ?? 0,
        salesPrice: body.salesPrice ?? 0,
        minStockLevel: body.minStockLevel ?? 0,
      },
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, code: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
      },
    });

    return c.json({ data: product }, 201);
  },

  /**
   * PATCH /api/products/:id
   * Ürün bilgilerini günceller.
   */
  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const productId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });

    if (!product) {
      return c.json(new NotFoundError('Ürün', productId).toJSON(), 404);
    }

    const body = await c.req.json<UpdateProductDTO>();

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(body.taxRateId !== undefined && { taxRateId: body.taxRateId }),
        ...(body.barcode !== undefined && { barcode: body.barcode }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.purchasePrice !== undefined && { purchasePrice: body.purchasePrice }),
        ...(body.salesPrice !== undefined && { salesPrice: body.salesPrice }),
        ...(body.minStockLevel !== undefined && { minStockLevel: body.minStockLevel }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, code: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
      },
    });

    return c.json({ data: updated });
  },

  /**
   * DELETE /api/products/:id
   * Ürünü soft-delete yapar.
   */
  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const productId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });

    if (!product) {
      return c.json(new NotFoundError('Ürün', productId).toJSON(), 404);
    }

    await prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date() },
    });

    return c.json({ data: { success: true } });
  },
};
