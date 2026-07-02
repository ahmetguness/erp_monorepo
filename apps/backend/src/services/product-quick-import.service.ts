import { AuditAction, EntityType, FeatureKey, Prisma, PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors/index.js';
import { TenantFeatureService } from './tenant-feature.service.js';
import { parseLimitValue } from '../utils/feature-parser.js';
import { buildCsv, parseCsv } from '../utils/csv.js';
import { createAuditLog } from '../utils/audit.js';

export interface ProductQuickImportInput {
  csv: string;
  partialImport?: boolean;
}

export interface ProductQuickImportRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ProductQuickImportChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ProductQuickImportNormalizedRow {
  code: string;
  name: string;
  unitCode: string;
  barcode: string | null;
  salesPrice: number;
  purchasePrice: number;
  minStockLevel: number;
  categoryName: string | null;
  taxRateName: string | null;
  description: string | null;
  isActive: boolean;
}

export interface ProductQuickImportPreviewRow {
  rowNumber: number;
  values: Record<string, string>;
  normalized: ProductQuickImportNormalizedRow | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProductQuickImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importableRows: number;
  currentProductCount: number;
  maxProducts: number | null;
  remainingSlots: number | null;
}

export interface ProductQuickImportPreview {
  headers: string[];
  rows: ProductQuickImportPreviewRow[];
  errors: string[];
  checklist: ProductQuickImportChecklistItem[];
  summary: ProductQuickImportSummary;
}

export interface ProductQuickImportCommitResult {
  createdCount: number;
  skippedCount: number;
  summary: ProductQuickImportSummary;
}

type ReferenceMaps = {
  unitsByCode: Map<string, string>;
  categoriesByName: Map<string, string>;
  taxRatesByName: Map<string, string>;
};

type ImportablePreviewRow = ProductQuickImportPreviewRow & {
  normalized: ProductQuickImportNormalizedRow;
};

type ParsedBoolean = { ok: true; value: boolean } | { ok: false };
type ParsedNumber = { ok: true; value: number } | { ok: false };

const PRODUCT_IMPORT_HEADERS = [
  'code',
  'name',
  'unitCode',
  'barcode',
  'salesPrice',
  'purchasePrice',
  'minStockLevel',
  'categoryName',
  'taxRateName',
  'description',
  'isActive',
] as const;

const REQUIRED_HEADERS = ['code', 'name', 'unitCode'] as const;
const OPTIONAL_NUMBER_FIELDS = ['salesPrice', 'purchasePrice', 'minStockLevel'] as const;

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function cleanText(value: string | undefined): string {
  return (value ?? '').trim();
}

function cleanOptionalText(value: string | undefined): string | null {
  const trimmed = cleanText(value);
  return trimmed.length > 0 ? trimmed : null;
}

function parseNonNegativeNumber(value: string | undefined): ParsedNumber {
  const trimmed = cleanText(value);
  if (!trimmed) return { ok: true, value: 0 };
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
  return { ok: true, value: parsed };
}

function parseBoolean(value: string | undefined): ParsedBoolean {
  const trimmed = normalizeKey(value ?? '').replace(/\u0131/g, 'i');
  if (!trimmed) return { ok: true, value: true };
  if (['true', '1', 'evet', 'yes', 'aktif'].includes(trimmed)) return { ok: true, value: true };
  if (['false', '0', 'hayir', 'no', 'pasif'].includes(trimmed)) return { ok: true, value: false };
  return { ok: false };
}

function toMapByName(items: { id: string; name: string }[]): Map<string, string> {
  return new Map(items.map((item) => [normalizeKey(item.name), item.id]));
}

function toMapByCode(items: { id: string; code: string }[]): Map<string, string> {
  return new Map(items.map((item) => [normalizeKey(item.code), item.id]));
}

function calculateSummary(
  rows: ProductQuickImportPreviewRow[],
  currentProductCount: number,
  maxProducts: number | null,
): ProductQuickImportSummary {
  const validRows = rows.filter((row) => row.valid).length;
  const invalidRows = rows.length - validRows;
  const remainingSlots = maxProducts === null ? null : Math.max(0, maxProducts - currentProductCount);
  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    importableRows: validRows,
    currentProductCount,
    maxProducts,
    remainingSlots,
  };
}

function buildChecklist(
  missingHeaders: string[],
  rows: ProductQuickImportPreviewRow[],
  currentProductCount: number,
  maxProducts: number | null,
): ProductQuickImportChecklistItem[] {
  const validRows = rows.filter((row) => row.valid).length;
  const duplicateRows = rows.filter((row) => row.errors.some((error) => error.includes('dosyada tekrar'))).length;
  const referenceRows = rows.filter((row) => row.errors.some((error) => error.includes('bulunamadi'))).length;
  const remainingSlots = maxProducts === null ? null : Math.max(0, maxProducts - currentProductCount);

  return [
    {
      key: 'headers',
      label: 'Zorunlu kolonlar',
      ok: missingHeaders.length === 0,
      detail: missingHeaders.length === 0 ? 'code, name ve unitCode kolonlari hazir.' : `${missingHeaders.join(', ')} kolonu eksik.`,
    },
    {
      key: 'row-quality',
      label: 'Satir dogrulama',
      ok: rows.length > 0 && rows.some((row) => row.valid) && rows.every((row) => row.errors.length === 0),
      detail: `${validRows} satir hazir, ${rows.length - validRows} satir duzeltme bekliyor.`,
    },
    {
      key: 'duplicates',
      label: 'Kod tekrar kontrolu',
      ok: duplicateRows === 0,
      detail: duplicateRows === 0 ? 'Dosya icinde tekrar eden urun kodu yok.' : `${duplicateRows} satirda kod tekrari var.`,
    },
    {
      key: 'references',
      label: 'Birim ve referanslar',
      ok: referenceRows === 0,
      detail: referenceRows === 0 ? 'Birim, kategori ve vergi eslesmeleri temiz.' : `${referenceRows} satirda eslesmeyen referans var.`,
    },
    {
      key: 'starter-limit',
      label: 'Starter urun limiti',
      ok: remainingSlots === null || validRows <= remainingSlots,
      detail: maxProducts === null
        ? 'Bu tenant icin urun limiti sinirsiz.'
        : `${currentProductCount}/${maxProducts} urun kullaniliyor, ${remainingSlots} yeni urun alani var.`,
    },
  ];
}

function isImportableRow(row: ProductQuickImportPreviewRow): row is ImportablePreviewRow {
  return row.valid && row.normalized !== null;
}

export class ProductQuickImportService {
  private readonly tenantFeatureService: TenantFeatureService;

  constructor(private readonly prisma: PrismaClient) {
    this.tenantFeatureService = new TenantFeatureService(prisma);
  }

  buildTemplateCsv(): string {
    return buildCsv([...PRODUCT_IMPORT_HEADERS], [{
      code: 'PRD-001',
      name: 'Ornek Urun',
      unitCode: 'AD',
      barcode: '869000000001',
      salesPrice: 120,
      purchasePrice: 80,
      minStockLevel: 10,
      categoryName: '',
      taxRateName: '',
      description: 'Excel uyumlu CSV satiri',
      isActive: true,
    }]);
  }

  async preview(tenantId: string, input: ProductQuickImportInput): Promise<ProductQuickImportPreview> {
    const parsed = parseCsv(input.csv);
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
    const [references, existingCodes, currentProductCount, maxProducts] = await Promise.all([
      this.getReferences(tenantId),
      this.getExistingCodes(tenantId, parsed.rows),
      this.prisma.product.count({ where: { tenantId, deletedAt: null } }),
      this.getMaxProductLimit(tenantId),
    ]);

    const duplicateCodes = this.findFileDuplicateCodes(parsed.rows);
    const rows = parsed.rows.map((values, index) => this.validateRow(values, index + 2, references, existingCodes, duplicateCodes));
    const validBeforeLimit = rows.filter((row) => row.valid).length;
    const remainingSlots = maxProducts === null ? null : Math.max(0, maxProducts - currentProductCount);
    if (remainingSlots !== null && validBeforeLimit > remainingSlots) {
      let acceptedRows = 0;
      for (const row of rows) {
        if (!row.valid) continue;
        acceptedRows += 1;
        if (acceptedRows > remainingSlots) {
          row.errors.push(`Starter urun limiti asiliyor. En fazla ${remainingSlots} yeni urun ice aktarilabilir.`);
          row.valid = false;
        }
      }
    }

    const summary = calculateSummary(rows, currentProductCount, maxProducts);
    return {
      headers: [...PRODUCT_IMPORT_HEADERS],
      rows,
      errors: missingHeaders.map((header) => `${header} kolonu zorunludur.`),
      checklist: buildChecklist(missingHeaders, rows, currentProductCount, maxProducts),
      summary,
    };
  }

  async commit(
    tenantId: string,
    userId: string | undefined,
    input: ProductQuickImportInput,
    meta: ProductQuickImportRequestMeta,
  ): Promise<ProductQuickImportCommitResult> {
    const preview = await this.preview(tenantId, input);
    const invalidRows = preview.rows.filter((row) => !row.valid);
    const rowsToImport = preview.rows.filter(isImportableRow);

    if (preview.errors.length > 0) {
      throw new ValidationError(preview.errors[0] ?? 'CSV basliklari gecersiz.');
    }
    if (!input.partialImport && invalidRows.length > 0) {
      throw new ValidationError('Duzeltilmesi gereken satirlar var. Kismi import secilmedigi icin kayit yapilmadi.');
    }
    if (rowsToImport.length === 0) {
      throw new ValidationError('Ice aktarilabilecek gecerli satir bulunamadi.');
    }

    const references = await this.getReferences(tenantId);
    const data = rowsToImport.map((row): Prisma.ProductCreateManyInput => {
      return {
        tenantId,
        code: row.normalized.code,
        name: row.normalized.name,
        unitId: references.unitsByCode.get(normalizeKey(row.normalized.unitCode)) ?? '',
        categoryId: row.normalized.categoryName ? references.categoriesByName.get(normalizeKey(row.normalized.categoryName)) ?? null : null,
        taxRateId: row.normalized.taxRateName ? references.taxRatesByName.get(normalizeKey(row.normalized.taxRateName)) ?? null : null,
        barcode: row.normalized.barcode,
        description: row.normalized.description,
        purchasePrice: row.normalized.purchasePrice,
        salesPrice: row.normalized.salesPrice,
        minStockLevel: row.normalized.minStockLevel,
        isActive: row.normalized.isActive,
        createdById: userId ?? null,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      const currentProductCount = await tx.product.count({ where: { tenantId, deletedAt: null } });
      const maxProducts = await this.getMaxProductLimit(tenantId);
      if (maxProducts !== null && currentProductCount + data.length > maxProducts) {
        throw new ValidationError(`Starter urun limiti asiliyor. Kalan hak: ${Math.max(0, maxProducts - currentProductCount)}.`);
      }

      const duplicateCodes = await tx.product.findMany({
        where: { tenantId, deletedAt: null, code: { in: data.map((product) => product.code) } },
        select: { code: true },
      });
      if (duplicateCodes.length > 0) {
        throw new ValidationError(`Bu urun kodlari zaten kullaniliyor: ${duplicateCodes.map((product) => product.code).join(', ')}.`);
      }

      await tx.product.createMany({ data });
      await createAuditLog(tx, {
        tenantId,
        userId: userId ?? null,
        module: 'inventory',
        entityType: EntityType.PRODUCT,
        entityId: 'product-quick-import',
        action: AuditAction.CREATE,
        newValues: {
          createdCount: data.length,
          skippedCount: preview.summary.totalRows - data.length,
          codes: rowsToImport.map((row) => row.normalized?.code ?? '').filter((code) => code.length > 0),
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });

    return {
      createdCount: data.length,
      skippedCount: preview.summary.totalRows - data.length,
      summary: preview.summary,
    };
  }

  private async getMaxProductLimit(tenantId: string): Promise<number | null> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, FeatureKey.MAX_PRODUCTS);
    const parsed = parseLimitValue(feature.value);
    return parsed.isUnlimited ? null : parsed.limit;
  }

  private async getReferences(tenantId: string): Promise<ReferenceMaps> {
    const [units, categories, taxRates] = await Promise.all([
      this.prisma.unit.findMany({ where: { tenantId }, select: { id: true, code: true } }),
      this.prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.taxRate.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
    ]);

    return {
      unitsByCode: toMapByCode(units),
      categoriesByName: toMapByName(categories),
      taxRatesByName: toMapByName(taxRates),
    };
  }

  private async getExistingCodes(tenantId: string, rows: Record<string, string>[]): Promise<Set<string>> {
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code)).filter((code) => code.length > 0)));
    if (codes.length === 0) return new Set();
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, code: { in: codes } },
      select: { code: true },
    });
    return new Set(products.map((product) => normalizeKey(product.code)));
  }

  private findFileDuplicateCodes(rows: Record<string, string>[]): Set<number> {
    const seen = new Map<string, number>();
    const duplicates = new Set<number>();
    rows.forEach((row, index) => {
      const code = normalizeKey(row.code ?? '');
      if (!code) return;
      const firstIndex = seen.get(code);
      if (firstIndex === undefined) {
        seen.set(code, index);
        return;
      }
      duplicates.add(index);
    });
    return duplicates;
  }

  private validateRow(
    values: Record<string, string>,
    rowNumber: number,
    references: ReferenceMaps,
    existingCodes: Set<string>,
    duplicateCodes: Set<number>,
  ): ProductQuickImportPreviewRow {
    const errors: string[] = [];
    const warnings: string[] = [];
    const code = cleanText(values.code);
    const name = cleanText(values.name);
    const unitCode = cleanText(values.unitCode);
    const categoryName = cleanOptionalText(values.categoryName);
    const taxRateName = cleanOptionalText(values.taxRateName);

    if (!code) errors.push('code zorunludur.');
    if (!name) errors.push('name zorunludur.');
    if (!unitCode) errors.push('unitCode zorunludur.');
    if (code && existingCodes.has(normalizeKey(code))) errors.push(`"${code}" kodu sistemde zaten var.`);
    if (duplicateCodes.has(rowNumber - 2)) errors.push(`"${code}" kodu dosyada tekrar ediyor.`);
    if (unitCode && !references.unitsByCode.has(normalizeKey(unitCode))) errors.push(`"${unitCode}" birim kodu bulunamadi.`);
    if (categoryName && !references.categoriesByName.has(normalizeKey(categoryName))) errors.push(`"${categoryName}" kategorisi bulunamadi.`);
    if (taxRateName && !references.taxRatesByName.has(normalizeKey(taxRateName))) errors.push(`"${taxRateName}" vergi orani bulunamadi.`);

    const parsedNumbers = OPTIONAL_NUMBER_FIELDS.map((field) => [field, parseNonNegativeNumber(values[field])] as const);
    for (const [field, parsed] of parsedNumbers) {
      if (!parsed.ok) errors.push(`${field} negatif olmayan sayi olmalidir.`);
    }
    const parsedIsActive = parseBoolean(values.isActive);
    if (!parsedIsActive.ok) errors.push('isActive true/false, evet/hayir veya aktif/pasif olmalidir.');

    const normalized = errors.length === 0 ? {
      code,
      name,
      unitCode,
      barcode: cleanOptionalText(values.barcode),
      salesPrice: parsedNumbers[0][1].ok ? parsedNumbers[0][1].value : 0,
      purchasePrice: parsedNumbers[1][1].ok ? parsedNumbers[1][1].value : 0,
      minStockLevel: parsedNumbers[2][1].ok ? parsedNumbers[2][1].value : 0,
      categoryName,
      taxRateName,
      description: cleanOptionalText(values.description),
      isActive: parsedIsActive.ok ? parsedIsActive.value : true,
    } : null;

    if (!values.barcode?.trim()) warnings.push('Barkod bos; sonradan eklenebilir.');

    return {
      rowNumber,
      values,
      normalized,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
