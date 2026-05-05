import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const UnitSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  code: z.string(),
});

export const CategorySchema: z.ZodType<CategoryItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    tenantId: z.string().optional(),
    name: z.string(),
    parentId: z.string().nullable().optional(),
    children: z.array(CategorySchema).optional(),
  }),
);

export const TaxRateSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  rate: z.coerce.number(),
  isActive: z.boolean(),
});

export const CurrencySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  defaultRate: z.coerce.number(),
  isBase: z.boolean(),
});

// ─────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────

export type Unit = z.infer<typeof UnitSchema>;

export interface CategoryItem {
  id: string;
  tenantId?: string;
  name: string;
  parentId?: string | null;
  children?: CategoryItem[];
}

export type TaxRate = z.infer<typeof TaxRateSchema>;
export type Currency = z.infer<typeof CurrencySchema>;

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface CreateUnitDTO { name: string; code: string; }
export interface CreateCategoryDTO { name: string; parentId?: string; }
export interface UpdateCategoryDTO { name?: string; parentId?: string; }
export interface CreateTaxRateDTO { name: string; rate: number; }
export interface UpdateTaxRateDTO { name?: string; rate?: number; isActive?: boolean; }
export interface CreateCurrencyDTO {
  code: string; name: string; symbol: string;
  defaultRate?: number; isBase?: boolean;
}

// ─────────────────────────────────────────────
// Units
// ─────────────────────────────────────────────

const UnitsResponseSchema = SingleResponseSchema(z.array(UnitSchema));

export async function getUnits(): Promise<Unit[]> {
  const res = await apiClient.get('/api/master/units');
  return safeParse(UnitsResponseSchema, res.data, 'getUnits').data;
}

export async function createUnit(data: CreateUnitDTO): Promise<Unit> {
  const res = await apiClient.post('/api/master/units', data);
  return safeParse(SingleResponseSchema(UnitSchema), res.data, 'createUnit').data;
}

export async function deleteUnit(id: string): Promise<void> {
  await apiClient.delete(`/api/master/units/${id}`);
}

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────

const CategoriesResponseSchema = SingleResponseSchema(z.array(CategorySchema));

export async function getCategories(): Promise<CategoryItem[]> {
  const res = await apiClient.get('/api/master/categories');
  return safeParse(CategoriesResponseSchema, res.data, 'getCategories').data;
}

export async function createCategory(data: CreateCategoryDTO): Promise<CategoryItem> {
  const res = await apiClient.post('/api/master/categories', data);
  return safeParse(SingleResponseSchema(CategorySchema), res.data, 'createCategory').data;
}

export async function updateCategory(id: string, data: UpdateCategoryDTO): Promise<CategoryItem> {
  const res = await apiClient.patch(`/api/master/categories/${id}`, data);
  return safeParse(SingleResponseSchema(CategorySchema), res.data, 'updateCategory').data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/api/master/categories/${id}`);
}

// ─────────────────────────────────────────────
// Tax Rates
// ─────────────────────────────────────────────

const TaxRatesResponseSchema = SingleResponseSchema(z.array(TaxRateSchema));

export async function getTaxRates(): Promise<TaxRate[]> {
  const res = await apiClient.get('/api/master/tax-rates');
  return safeParse(TaxRatesResponseSchema, res.data, 'getTaxRates').data;
}

export async function createTaxRate(data: CreateTaxRateDTO): Promise<TaxRate> {
  const res = await apiClient.post('/api/master/tax-rates', data);
  return safeParse(SingleResponseSchema(TaxRateSchema), res.data, 'createTaxRate').data;
}

export async function updateTaxRate(id: string, data: UpdateTaxRateDTO): Promise<TaxRate> {
  const res = await apiClient.patch(`/api/master/tax-rates/${id}`, data);
  return safeParse(SingleResponseSchema(TaxRateSchema), res.data, 'updateTaxRate').data;
}

// ─────────────────────────────────────────────
// Currencies
// ─────────────────────────────────────────────

const CurrenciesResponseSchema = SingleResponseSchema(z.array(CurrencySchema));

export async function getCurrencies(): Promise<Currency[]> {
  const res = await apiClient.get('/api/master/currencies');
  return safeParse(CurrenciesResponseSchema, res.data, 'getCurrencies').data;
}

export async function createCurrency(data: CreateCurrencyDTO): Promise<Currency> {
  const res = await apiClient.post('/api/master/currencies', data);
  return safeParse(SingleResponseSchema(CurrencySchema), res.data, 'createCurrency').data;
}
