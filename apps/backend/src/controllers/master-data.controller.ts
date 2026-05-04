import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateUnitDTO { name: string; code: string; }
interface CreateCategoryDTO { name: string; parentId?: string; }
interface UpdateCategoryDTO { name?: string; parentId?: string; }
interface CreateTaxRateDTO { name: string; rate: number; }
interface UpdateTaxRateDTO { name?: string; rate?: number; isActive?: boolean; }
interface CreateCurrencyDTO {
  code: string; name: string; symbol: string;
  defaultRate?: number; isBase?: boolean;
}

// ─────────────────────────────────────────────
// Master Data Controller — Unit, Category, TaxRate, Currency
// ─────────────────────────────────────────────

export const MasterDataController = {
  // ── Units ────────────────────────────────────

  async listUnits(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const units = await prisma.unit.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    return c.json({ data: units });
  },

  async createUnit(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<CreateUnitDTO>();
    if (!body.name || !body.code) return c.json(new ValidationError('name ve code zorunludur.').toJSON(), 400);
    const existing = await prisma.unit.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } });
    if (existing) return c.json(new ValidationError(`"${body.code}" kodu zaten kullanımda.`).toJSON(), 400);
    const unit = await prisma.unit.create({ data: { tenantId, name: body.name, code: body.code } });
    return c.json({ data: unit }, 201);
  },

  async deleteUnit(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const unitId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId } });
    if (!unit) return c.json(new NotFoundError('Birim', unitId).toJSON(), 404);
    const usedCount = await prisma.product.count({ where: { unitId, deletedAt: null } });
    if (usedCount > 0) return c.json(new ValidationError(`Bu birim ${usedCount} üründe kullanılıyor.`).toJSON(), 400);
    await prisma.unit.delete({ where: { id: unitId } });
    return c.json({ data: { success: true } });
  },

  // ── Categories ───────────────────────────────

  async listCategories(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const categories = await prisma.category.findMany({
      where: { tenantId },
      include: { children: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return c.json({ data: categories });
  },

  async createCategory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<CreateCategoryDTO>();
    if (!body.name) return c.json(new ValidationError('name zorunludur.').toJSON(), 400);
    const category = await prisma.category.create({ data: { tenantId, name: body.name, parentId: body.parentId ?? null } });
    return c.json({ data: category }, 201);
  },

  async updateCategory(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const categoryId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
    if (!category) return c.json(new NotFoundError('Kategori', categoryId).toJSON(), 404);
    const body = await c.req.json<UpdateCategoryDTO>();
    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
      },
    });
    return c.json({ data: updated });
  },

  async deleteCategory(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const categoryId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
    if (!category) return c.json(new NotFoundError('Kategori', categoryId).toJSON(), 404);
    const usedCount = await prisma.product.count({ where: { categoryId, deletedAt: null } });
    if (usedCount > 0) return c.json(new ValidationError(`Bu kategori ${usedCount} üründe kullanılıyor.`).toJSON(), 400);
    await prisma.category.delete({ where: { id: categoryId } });
    return c.json({ data: { success: true } });
  },

  // ── Tax Rates ────────────────────────────────

  async listTaxRates(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const taxRates = await prisma.taxRate.findMany({ where: { tenantId, isActive: true }, orderBy: { rate: 'asc' } });
    return c.json({ data: taxRates });
  },

  async createTaxRate(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<CreateTaxRateDTO>();
    if (!body.name || body.rate === undefined) return c.json(new ValidationError('name ve rate zorunludur.').toJSON(), 400);
    const taxRate = await prisma.taxRate.create({ data: { tenantId, name: body.name, rate: body.rate } });
    return c.json({ data: taxRate }, 201);
  },

  async updateTaxRate(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const taxRateId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    const taxRate = await prisma.taxRate.findFirst({ where: { id: taxRateId, tenantId } });
    if (!taxRate) return c.json(new NotFoundError('KDV oranı', taxRateId).toJSON(), 404);
    const body = await c.req.json<UpdateTaxRateDTO>();
    const updated = await prisma.taxRate.update({
      where: { id: taxRateId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.rate !== undefined && { rate: body.rate }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return c.json({ data: updated });
  },

  // ── Currencies ───────────────────────────────

  async listCurrencies(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const currencies = await prisma.currency.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
    return c.json({ data: currencies });
  },

  async createCurrency(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<CreateCurrencyDTO>();
    if (!body.code || !body.name || !body.symbol) return c.json(new ValidationError('code, name ve symbol zorunludur.').toJSON(), 400);
    const existing = await prisma.currency.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } });
    if (existing) return c.json(new ValidationError(`"${body.code}" para birimi zaten tanımlı.`).toJSON(), 400);
    const currency = await prisma.currency.create({
      data: { tenantId, code: body.code, name: body.name, symbol: body.symbol, defaultRate: body.defaultRate ?? 1, isBase: body.isBase ?? false },
    });
    return c.json({ data: currency }, 201);
  },
};
