import { Context } from "hono";
import { Prisma } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { requireTenantId } from "../../../../utils/context.js";

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateUnitDTO {
  name: string;
  code: string;
}
interface CreateCategoryDTO {
  name: string;
  parentId?: string | null;
}
interface UpdateCategoryDTO {
  name?: string;
  parentId?: string | null;
}
interface CreateTaxRateDTO {
  name: string;
  rate: number;
  isWithholding?: boolean;
}
interface UpdateTaxRateDTO {
  name?: string;
  rate?: number;
  isActive?: boolean;
  isWithholding?: boolean;
}
interface CreateCurrencyDTO {
  code: string;
  name: string;
  symbol: string;
  defaultRate?: number;
  isBase?: boolean;
}

const KNOWN_CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  EUR: "\u20ac",
  GBP: "\u00a3",
  TRY: "\u20ba",
  USD: "$",
};

function normalizeCurrencySymbol(code: string, symbol: string): string {
  return KNOWN_CURRENCY_SYMBOLS[code.toUpperCase()] ?? symbol;
}

function parseCreateUnit(value: unknown): CreateUnitDTO {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Geçerli bir istek gövdesi zorunludur.");
  }
  const body = value as Record<string, unknown>;
  if (typeof body.name !== "string" || typeof body.code !== "string") {
    throw new ValidationError("name ve code metin olmalıdır.");
  }
  const name = body.name.trim();
  const code = body.code.trim().toUpperCase();
  if (!name || !code) throw new ValidationError("name ve code zorunludur.");
  if (name.length > 100)
    throw new ValidationError("name en fazla 100 karakter olabilir.");
  if (code.length > 10)
    throw new ValidationError("code en fazla 10 karakter olabilir.");
  return { name, code };
}

function parseCategoryBody(
  value: unknown,
  partial: boolean,
): CreateCategoryDTO | UpdateCategoryDTO {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Geçerli bir istek gövdesi zorunludur.");
  }
  const body = value as Record<string, unknown>;
  if (!partial && typeof body.name !== "string")
    throw new ValidationError("name zorunludur.");
  if (body.name !== undefined && typeof body.name !== "string")
    throw new ValidationError("name metin olmalıdır.");
  if (
    body.parentId !== undefined &&
    body.parentId !== null &&
    typeof body.parentId !== "string"
  ) {
    throw new ValidationError("parentId metin veya null olmalıdır.");
  }
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && !name)
    throw new ValidationError("name boş bırakılamaz.");
  if (name && name.length > 100)
    throw new ValidationError("name en fazla 100 karakter olabilir.");
  const parentId =
    typeof body.parentId === "string"
      ? body.parentId.trim() || null
      : body.parentId;
  if (partial && name === undefined && parentId === undefined)
    throw new ValidationError("Güncellenecek en az bir alan zorunludur.");
  return {
    ...(name !== undefined && { name }),
    ...(parentId !== undefined && { parentId }),
  };
}

async function requireTenantCategory(tenantId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, tenantId },
    select: { id: true },
  });
  if (!category) throw new ValidationError("Geçersiz üst kategori seçimi.");
}

function parseTaxRateBody(
  value: unknown,
  partial: boolean,
): CreateTaxRateDTO | UpdateTaxRateDTO {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Geçerli bir istek gövdesi zorunludur.");
  }
  const body = value as Record<string, unknown>;
  if (!partial && (body.name === undefined || body.rate === undefined)) {
    throw new ValidationError("name ve rate zorunludur.");
  }
  if (body.name !== undefined && typeof body.name !== "string")
    throw new ValidationError("name metin olmalıdır.");
  if (
    body.rate !== undefined &&
    (typeof body.rate !== "number" || !Number.isFinite(body.rate))
  ) {
    throw new ValidationError("rate sonlu bir sayı olmalıdır.");
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean")
    throw new ValidationError("isActive boolean olmalıdır.");
  if (
    body.isWithholding !== undefined &&
    typeof body.isWithholding !== "boolean"
  )
    throw new ValidationError("isWithholding boolean olmalıdır.");
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && !name)
    throw new ValidationError("name boş bırakılamaz.");
  if (name && name.length > 100)
    throw new ValidationError("name en fazla 100 karakter olabilir.");
  const rate = typeof body.rate === "number" ? body.rate : undefined;
  if (rate !== undefined && (rate < 0 || rate > 100))
    throw new ValidationError("rate 0-100 arasında olmalıdır.");
  if (
    rate !== undefined &&
    Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-9
  )
    throw new ValidationError("rate en fazla 2 ondalık basamak içerebilir.");
  const result = {
    ...(name !== undefined && { name }),
    ...(rate !== undefined && { rate }),
    ...(body.isActive !== undefined && { isActive: body.isActive as boolean }),
    ...(body.isWithholding !== undefined && {
      isWithholding: body.isWithholding as boolean,
    }),
  };
  if (partial && Object.keys(result).length === 0)
    throw new ValidationError("Güncellenecek en az bir alan zorunludur.");
  return result;
}

function parseCreateCurrency(value: unknown): CreateCurrencyDTO {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Geçerli bir istek gövdesi zorunludur.");
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.code !== "string" ||
    typeof body.name !== "string" ||
    typeof body.symbol !== "string"
  ) {
    throw new ValidationError("code, name ve symbol metin olarak zorunludur.");
  }
  if (
    body.defaultRate !== undefined &&
    (typeof body.defaultRate !== "number" || !Number.isFinite(body.defaultRate))
  ) {
    throw new ValidationError("defaultRate sonlu bir sayı olmalıdır.");
  }
  if (body.isBase !== undefined && typeof body.isBase !== "boolean")
    throw new ValidationError("isBase boolean olmalıdır.");
  const code = body.code.trim().toUpperCase();
  const name = body.name.trim();
  const symbol = body.symbol.trim();
  const defaultRate = body.defaultRate === undefined ? 1 : body.defaultRate;
  const isBase = body.isBase ?? false;
  if (!/^[A-Z]{3}$/.test(code))
    throw new ValidationError("code üç harfli ISO para birimi kodu olmalıdır.");
  if (!name || name.length > 100)
    throw new ValidationError("name 1-100 karakter arasında olmalıdır.");
  if (!symbol || symbol.length > 5)
    throw new ValidationError("symbol 1-5 karakter arasında olmalıdır.");
  if (defaultRate <= 0 || defaultRate >= 1_000_000_000_000)
    throw new ValidationError(
      "defaultRate geçerli pozitif aralıkta olmalıdır.",
    );
  if (
    Math.abs(defaultRate * 1_000_000 - Math.round(defaultRate * 1_000_000)) >
    1e-6
  ) {
    throw new ValidationError(
      "defaultRate en fazla 6 ondalık basamak içerebilir.",
    );
  }
  if (isBase && defaultRate !== 1)
    throw new ValidationError("Ana para biriminin kuru 1 olmalıdır.");
  return { code, name, symbol, defaultRate, isBase };
}

// ─────────────────────────────────────────────
// Master Data Controller — Unit, Category, TaxRate, Currency
// ─────────────────────────────────────────────

export const MasterDataController = {
  // ── Units ────────────────────────────────────

  async listUnits(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const units = await prisma.unit.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return c.json({ data: units });
  },

  async createUnit(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parseCreateUnit(await c.req.json<unknown>());
    const existing = await prisma.unit.findUnique({
      where: { tenantId_code: { tenantId, code: body.code } },
    });
    if (existing)
      return c.json(
        new ConflictError(`"${body.code}" kodu zaten kullanımda.`).toJSON(),
        409,
      );
    try {
      const unit = await prisma.unit.create({
        data: { tenantId, name: body.name, code: body.code },
      });
      return c.json({ data: unit }, 201);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return c.json(
          new ConflictError(`"${body.code}" kodu zaten kullanımda.`).toJSON(),
          409,
        );
      }
      throw error;
    }
  },

  async deleteUnit(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const unitId = c.req.param("id");
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, tenantId },
    });
    if (!unit) return c.json(new NotFoundError("Birim", unitId).toJSON(), 404);
    const usedCount = await prisma.product.count({
      where: { tenantId, unitId },
    });
    if (usedCount > 0)
      return c.json(
        new ValidationError(
          `Bu birim ${usedCount} üründe kullanılıyor.`,
        ).toJSON(),
        400,
      );
    try {
      await prisma.unit.delete({ where: { id: unitId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return c.json(
          new ConflictError(
            "Birim kullanımda olduğu için silinemiyor.",
          ).toJSON(),
          409,
        );
      }
      throw error;
    }
    return c.json({ data: { success: true } });
  },

  // ── Categories ───────────────────────────────

  async listCategories(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rows = await prisma.category.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    type CategoryNode = (typeof rows)[number] & { children: CategoryNode[] };
    const byId = new Map(
      rows.map((row) => [row.id, { ...row, children: [] as CategoryNode[] }]),
    );
    const roots: CategoryNode[] = [];
    for (const row of rows) {
      const node = byId.get(row.id)!;
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return c.json({ data: roots });
  },

  async createCategory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parseCategoryBody(
      await c.req.json<unknown>(),
      false,
    ) as CreateCategoryDTO;
    if (body.parentId) await requireTenantCategory(tenantId, body.parentId);
    const category = await prisma.category.create({
      data: { tenantId, name: body.name, parentId: body.parentId ?? null },
    });
    return c.json({ data: category }, 201);
  },

  async updateCategory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const categoryId = c.req.param("id");
    const category = await prisma.category.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!category)
      return c.json(new NotFoundError("Kategori", categoryId).toJSON(), 404);
    const body = parseCategoryBody(
      await c.req.json<unknown>(),
      true,
    ) as UpdateCategoryDTO;
    if (body.parentId) {
      if (body.parentId === categoryId)
        throw new ValidationError("Kategori kendisinin üst kategorisi olamaz.");
      await requireTenantCategory(tenantId, body.parentId);
      const descendants = await prisma.$queryRaw<Array<{ id: string }>>`
        WITH RECURSIVE descendants AS (
          SELECT id FROM categories WHERE "parentId" = ${categoryId} AND "tenantId" = ${tenantId}
          UNION ALL
          SELECT c.id FROM categories c JOIN descendants d ON c."parentId" = d.id WHERE c."tenantId" = ${tenantId}
        ) SELECT id FROM descendants WHERE id = ${body.parentId} LIMIT 1
      `;
      if (descendants.length > 0)
        throw new ValidationError("Kategori kendi alt kategorisine taşınamaz.");
    }
    try {
      const updated = await prisma.category.update({
        where: { id: categoryId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.parentId !== undefined && { parentId: body.parentId }),
        },
      });
      return c.json({ data: updated });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return c.json(new NotFoundError("Kategori", categoryId).toJSON(), 404);
      }
      throw error;
    }
  },

  async deleteCategory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const categoryId = c.req.param("id");
    const category = await prisma.category.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!category)
      return c.json(new NotFoundError("Kategori", categoryId).toJSON(), 404);
    const childCount = await prisma.category.count({
      where: { tenantId, parentId: categoryId },
    });
    if (childCount > 0)
      return c.json(
        new ValidationError(
          `Bu kategorinin ${childCount} alt kategorisi bulunuyor.`,
        ).toJSON(),
        400,
      );
    const usedCount = await prisma.product.count({
      where: { tenantId, categoryId },
    });
    if (usedCount > 0)
      return c.json(
        new ValidationError(
          `Bu kategori ${usedCount} üründe kullanılıyor.`,
        ).toJSON(),
        400,
      );
    try {
      await prisma.category.delete({ where: { id: categoryId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return c.json(
          new ConflictError(
            "Kategori kullanımda olduğu için silinemiyor.",
          ).toJSON(),
          409,
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return c.json(new NotFoundError("Kategori", categoryId).toJSON(), 404);
      }
      throw error;
    }
    return c.json({ data: { success: true } });
  },

  // ── Tax Rates ────────────────────────────────

  async listTaxRates(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const taxRates = await prisma.taxRate.findMany({
      where: { tenantId, isActive: true },
      orderBy: { rate: "asc" },
    });
    return c.json({ data: taxRates });
  },

  async createTaxRate(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parseTaxRateBody(
      await c.req.json<unknown>(),
      false,
    ) as CreateTaxRateDTO;
    const taxRate = await prisma.taxRate.create({
      data: {
        tenantId,
        name: body.name,
        rate: body.rate,
        isWithholding: body.isWithholding ?? false,
      },
    });
    return c.json({ data: taxRate }, 201);
  },

  async updateTaxRate(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const taxRateId = c.req.param("id");
    const taxRate = await prisma.taxRate.findFirst({
      where: { id: taxRateId, tenantId },
    });
    if (!taxRate)
      return c.json(new NotFoundError("KDV oranı", taxRateId).toJSON(), 404);
    const body = parseTaxRateBody(
      await c.req.json<unknown>(),
      true,
    ) as UpdateTaxRateDTO;
    try {
      const updated = await prisma.taxRate.update({
        where: { id: taxRateId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.rate !== undefined && { rate: body.rate }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.isWithholding !== undefined && {
            isWithholding: body.isWithholding,
          }),
        },
      });
      return c.json({ data: updated });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return c.json(new NotFoundError("KDV oranı", taxRateId).toJSON(), 404);
      }
      throw error;
    }
  },

  // ── Currencies ───────────────────────────────

  async listCurrencies(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const currencies = await prisma.currency.findMany({
      where: { tenantId },
      orderBy: { code: "asc" },
    });
    return c.json({
      data: currencies.map((currency) => ({
        ...currency,
        symbol: normalizeCurrencySymbol(currency.code, currency.symbol),
      })),
    });
  },

  async createCurrency(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = parseCreateCurrency(await c.req.json<unknown>());
    const existing = await prisma.currency.findUnique({
      where: { tenantId_code: { tenantId, code: body.code } },
    });
    if (existing)
      return c.json(
        new ConflictError(`"${body.code}" para birimi zaten tanımlı.`).toJSON(),
        409,
      );
    if (
      body.isBase &&
      (await prisma.currency.count({ where: { tenantId, isBase: true } })) > 0
    ) {
      return c.json(
        new ConflictError(
          "Tenant için ana para birimi zaten tanımlı.",
        ).toJSON(),
        409,
      );
    }
    try {
      const currency = await prisma.currency.create({
        data: {
          tenantId,
          ...body,
          symbol: normalizeCurrencySymbol(body.code, body.symbol),
        },
      });
      return c.json(
        {
          data: {
            ...currency,
            symbol: normalizeCurrencySymbol(currency.code, currency.symbol),
          },
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return c.json(
          new ConflictError(
            "Para birimi kodu veya ana para birimi zaten tanımlı.",
          ).toJSON(),
          409,
        );
      }
      throw error;
    }
  },
};
