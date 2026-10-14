import { Context } from 'hono';
import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId } from '../../../../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateUnitDTO { name: string; code: string; }
interface CreateCategoryDTO { name: string; parentId?: string; }
interface UpdateCategoryDTO { name?: string; parentId?: string; }
interface CreateTaxRateDTO { name: string; rate: number; isWithholding?: boolean; }
interface UpdateTaxRateDTO { name?: string; rate?: number; isActive?: boolean; isWithholding?: boolean; }
interface CreateCurrencyDTO {
  code: string; name: string; symbol: string;
  defaultRate?: number; isBase?: boolean;
}

const KNOWN_CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  EUR: '\u20ac',
  GBP: '\u00a3',
  TRY: '\u20ba',
  USD: '$',
};

function normalizeCurrencySymbol(code: string, symbol: string): string {
  return KNOWN_CURRENCY_SYMBOLS[code.toUpperCase()] ?? symbol;
}

function parseCreateUnit(value: unknown): CreateUnitDTO {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Geçerli bir istek gövdesi zorunludur.');
  }
  const body = value as Record<string, unknown>;
  if (typeof body.name !== 'string' || typeof body.code !== 'string') {
    throw new ValidationError('name ve code metin olmalıdır.');
  }
  const name = body.name.trim();
  const code = body.code.trim().toUpperCase();
  if (!name || !code) throw new ValidationError('name ve code zorunludur.');
  if (name.length > 100) throw new ValidationError('name en fazla 100 karakter olabilir.');
  if (code.length > 10) throw new ValidationError('code en fazla 10 karakter olabilir.');
  return { name, code };
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
    const body = parseCreateUnit(await c.req.json<unknown>());
    const existing = await prisma.unit.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } });
    if (existing) return c.json(new ConflictError(`"${body.code}" kodu zaten kullanımda.`).toJSON(), 409);
    try {
      const unit = await prisma.unit.create({ data: { tenantId, name: body.name, code: body.code } });
      return c.json({ data: unit }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return c.json(new ConflictError(`"${body.code}" kodu zaten kullanımda.`).toJSON(), 409);
      }
      throw error;
    }
  },

  async deleteUnit(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const unitId = c.req.param('id');
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId } });
    if (!unit) return c.json(new NotFoundError('Birim', unitId).toJSON(), 404);
    const usedCount = await prisma.product.count({ where: { tenantId, unitId } });
    if (usedCount > 0) return c.json(new ValidationError(`Bu birim ${usedCount} üründe kullanılıyor.`).toJSON(), 400);
    try {
      await prisma.unit.delete({ where: { id: unitId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return c.json(new ConflictError('Birim kullanımda olduğu için silinemiyor.').toJSON(), 409);
      }
      throw error;
    }
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
    const tenantId = requireTenantId(c);
    const categoryId = c.req.param('id');
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
    const tenantId = requireTenantId(c);
    const categoryId = c.req.param('id');
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
    if (!category) return c.json(new NotFoundError('Kategori', categoryId).toJSON(), 404);
    const usedCount = await prisma.product.count({ where: { tenantId, categoryId, deletedAt: null } });
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
    const taxRate = await prisma.taxRate.create({ data: { tenantId, name: body.name, rate: body.rate, isWithholding: body.isWithholding ?? false } });
    return c.json({ data: taxRate }, 201);
  },

  async updateTaxRate(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const taxRateId = c.req.param('id');
    const taxRate = await prisma.taxRate.findFirst({ where: { id: taxRateId, tenantId } });
    if (!taxRate) return c.json(new NotFoundError('KDV oranı', taxRateId).toJSON(), 404);
    const body = await c.req.json<UpdateTaxRateDTO>();
    const updated = await prisma.taxRate.update({
      where: { id: taxRateId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.rate !== undefined && { rate: body.rate }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.isWithholding !== undefined && { isWithholding: body.isWithholding }),
      },
    });
    return c.json({ data: updated });
  },

  // ── Currencies ───────────────────────────────

  async listCurrencies(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const currencies = await prisma.currency.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
    return c.json({
      data: currencies.map((currency) => ({
        ...currency,
        symbol: normalizeCurrencySymbol(currency.code, currency.symbol),
      })),
    });
  },

  async createCurrency(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<CreateCurrencyDTO>();
    if (!body.code || !body.name || !body.symbol) return c.json(new ValidationError('code, name ve symbol zorunludur.').toJSON(), 400);
    const existing = await prisma.currency.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } });
    if (existing) return c.json(new ValidationError(`"${body.code}" para birimi zaten tanımlı.`).toJSON(), 400);
    const currency = await prisma.currency.create({
      data: {
        tenantId,
        code: body.code,
        name: body.name,
        symbol: normalizeCurrencySymbol(body.code, body.symbol),
        defaultRate: body.defaultRate ?? 1,
        isBase: body.isBase ?? false,
      },
    });
    return c.json({
      data: {
        ...currency,
        symbol: normalizeCurrencySymbol(currency.code, currency.symbol),
      },
    }, 201);
  },
};
