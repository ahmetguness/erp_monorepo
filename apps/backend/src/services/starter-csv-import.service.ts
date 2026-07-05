import { AuditAction, ContactType, EntityType, FeatureKey, Prisma, PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors/index.js';
import { buildCsv, parseCsv } from '../utils/csv.js';
import { createAuditLog } from '../utils/audit.js';
import { parseLimitValue } from '../utils/feature-parser.js';
import { TenantFeatureService } from './tenant-feature.service.js';

export type StarterCsvImportEntity = 'products' | 'contacts';

export interface StarterCsvImportInput {
  csv: string;
  mapping?: Partial<Record<string, string>>;
  partialImport?: boolean;
}

export interface StarterCsvImportRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface StarterCsvImportChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface StarterCsvImportPreviewRow {
  rowNumber: number;
  values: Record<string, string>;
  normalized: Record<string, string | number | boolean | null> | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface StarterCsvImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importableRows: number;
  currentProductCount: number | null;
  maxProducts: number | null;
  remainingSlots: number | null;
}

export interface StarterCsvImportPreview {
  entity: StarterCsvImportEntity;
  sourceHeaders: string[];
  targetFields: string[];
  rows: StarterCsvImportPreviewRow[];
  errors: string[];
  checklist: StarterCsvImportChecklistItem[];
  summary: StarterCsvImportSummary;
}

export interface StarterCsvImportCommitResult {
  entity: StarterCsvImportEntity;
  createdCount: number;
  skippedCount: number;
  summary: StarterCsvImportSummary;
}

interface EntityConfig {
  entity: StarterCsvImportEntity;
  module: 'inventory' | 'contacts';
  headers: readonly string[];
  requiredHeaders: readonly string[];
}

type ProductReferences = {
  unitsByCode: Map<string, string>;
  categoriesByName: Map<string, string>;
  taxRatesByName: Map<string, string>;
};

type ParsedBoolean = { ok: true; value: boolean } | { ok: false };
type ParsedNumber = { ok: true; value: number } | { ok: false };

const PRODUCT_HEADERS = ['code', 'name', 'unitCode', 'barcode', 'salesPrice', 'purchasePrice', 'minStockLevel', 'categoryName', 'taxRateName', 'description', 'isActive'] as const;
const CONTACT_HEADERS = ['type', 'code', 'name', 'taxNumber', 'taxOffice', 'email', 'phone', 'city', 'country', 'paymentTermDays', 'isActive'] as const;

const ENTITY_CONFIGS: Record<StarterCsvImportEntity, EntityConfig> = {
  products: {
    entity: 'products',
    module: 'inventory',
    headers: PRODUCT_HEADERS,
    requiredHeaders: ['code', 'name', 'unitCode'],
  },
  contacts: {
    entity: 'contacts',
    module: 'contacts',
    headers: CONTACT_HEADERS,
    requiredHeaders: ['type', 'name'],
  },
};

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\u0131/g, 'i');
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
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
  return { ok: true, value: parsed };
}

function parseNonNegativeInteger(value: string | undefined): ParsedNumber {
  const parsed = parseNonNegativeNumber(value);
  if (!parsed.ok || !Number.isInteger(parsed.value)) return { ok: false };
  return parsed;
}

function parseBoolean(value: string | undefined): ParsedBoolean {
  const normalized = normalizeKey(value ?? '');
  if (!normalized) return { ok: true, value: true };
  if (['true', '1', 'evet', 'yes', 'aktif'].includes(normalized)) return { ok: true, value: true };
  if (['false', '0', 'hayir', 'no', 'pasif'].includes(normalized)) return { ok: true, value: false };
  return { ok: false };
}

function parseContactType(value: string | undefined): ContactType | null {
  const normalized = normalizeKey(value ?? '');
  if (normalized === 'customer' || normalized === 'musteri') return ContactType.CUSTOMER;
  if (normalized === 'supplier' || normalized === 'tedarikci') return ContactType.SUPPLIER;
  if (normalized === 'both' || normalized === 'her ikisi' || normalized === 'ikisi') return ContactType.BOTH;
  if (value === ContactType.CUSTOMER || value === ContactType.SUPPLIER || value === ContactType.BOTH) return value;
  return null;
}

function toMapByName(items: { id: string; name: string }[]): Map<string, string> {
  return new Map(items.map((item) => [normalizeKey(item.name), item.id]));
}

function toMapByCode(items: { id: string; code: string }[]): Map<string, string> {
  return new Map(items.map((item) => [normalizeKey(item.code), item.id]));
}

function remapRows(headers: readonly string[], rows: Record<string, string>[], mapping: Partial<Record<string, string>>): Record<string, string>[] {
  return rows.map((row) => {
    const output: Record<string, string> = {};
    for (const target of headers) {
      const mappedSource = mapping[target];
      const source = mappedSource === undefined ? target : mappedSource.trim();
      output[target] = source ? row[source] ?? '' : '';
    }
    return output;
  });
}

function findFileDuplicates(rows: Record<string, string>[], field: string): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const value = normalizeKey(row[field] ?? '');
    if (!value) return;
    if (seen.has(value)) {
      duplicates.add(index);
      return;
    }
    seen.set(value, index);
  });
  return duplicates;
}

function summarize(rows: StarterCsvImportPreviewRow[], currentProductCount: number | null, maxProducts: number | null): StarterCsvImportSummary {
  const validRows = rows.filter((row) => row.valid).length;
  return {
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    importableRows: validRows,
    currentProductCount,
    maxProducts,
    remainingSlots: currentProductCount === null || maxProducts === null ? null : Math.max(0, maxProducts - currentProductCount),
  };
}

function buildChecklist(config: EntityConfig, missingHeaders: string[], rows: StarterCsvImportPreviewRow[], summary: StarterCsvImportSummary): StarterCsvImportChecklistItem[] {
  const duplicateRows = rows.filter((row) => row.errors.some((error) => error.includes('tekrar') || error.includes('zaten'))).length;
  const baseItems: StarterCsvImportChecklistItem[] = [
    {
      key: 'headers',
      label: 'Zorunlu kolonlar',
      ok: missingHeaders.length === 0,
      detail: missingHeaders.length === 0 ? `${config.requiredHeaders.join(', ')} kolonlari hazir.` : `${missingHeaders.join(', ')} kolonu eksik.`,
    },
    {
      key: 'row-quality',
      label: 'Satir dogrulama',
      ok: rows.length > 0 && rows.every((row) => row.errors.length === 0),
      detail: `${summary.validRows} satir hazir, ${summary.invalidRows} satir duzeltme bekliyor.`,
    },
    {
      key: 'duplicates',
      label: 'Basit tekrar kontrolu',
      ok: duplicateRows === 0,
      detail: duplicateRows === 0 ? 'Dosya ve mevcut kayitlarda basit kod tekrari bulunmadi.' : `${duplicateRows} satirda tekrar riski var.`,
    },
  ];

  if (config.entity === 'products') {
    baseItems.push({
      key: 'starter-limit',
      label: 'Starter urun limiti',
      ok: summary.remainingSlots === null || summary.validRows <= summary.remainingSlots,
      detail: summary.maxProducts === null
        ? 'Bu tenant icin urun limiti sinirsiz.'
        : `${summary.currentProductCount}/${summary.maxProducts} urun kullaniliyor, ${summary.remainingSlots} yeni urun alani var.`,
    });
  }

  return baseItems;
}

function isImportableRow(row: StarterCsvImportPreviewRow): row is StarterCsvImportPreviewRow & { normalized: Record<string, string | number | boolean | null> } {
  return row.valid && row.normalized !== null;
}

export class StarterCsvImportService {
  private readonly tenantFeatureService: TenantFeatureService;

  constructor(private readonly prisma: PrismaClient) {
    this.tenantFeatureService = new TenantFeatureService(prisma);
  }

  getConfig(entity: StarterCsvImportEntity): EntityConfig {
    return ENTITY_CONFIGS[entity];
  }

  buildTemplateCsv(entity: StarterCsvImportEntity): string {
    if (entity === 'products') {
      return buildCsv([...PRODUCT_HEADERS], [{
        code: 'PRD-001',
        name: 'Ornek Urun',
        unitCode: 'AD',
        barcode: '869000000001',
        salesPrice: 120,
        purchasePrice: 80,
        minStockLevel: 10,
        categoryName: '',
        taxRateName: '',
        description: 'Starter CSV satiri',
        isActive: true,
      }]);
    }

    return buildCsv([...CONTACT_HEADERS], [{
      type: 'CUSTOMER',
      code: 'CAR-001',
      name: 'Ornek Musteri Ltd.',
      taxNumber: '1234567890',
      taxOffice: 'Merkez',
      email: 'info@example.com',
      phone: '+90 555 000 0000',
      city: 'Istanbul',
      country: 'TR',
      paymentTermDays: 30,
      isActive: true,
    }]);
  }

  async preview(entity: StarterCsvImportEntity, tenantId: string, input: StarterCsvImportInput): Promise<StarterCsvImportPreview> {
    const config = this.getConfig(entity);
    const parsed = parseCsv(input.csv);
    const mapping = input.mapping ?? {};
    const mappedRows = remapRows(config.headers, parsed.rows, mapping);
    const missingHeaders = config.requiredHeaders.filter((header) => {
      const mappedSource = mapping[header];
      const source = mappedSource === undefined ? header : mappedSource.trim();
      return !source || !parsed.headers.includes(source);
    });

    const rows = entity === 'products'
      ? await this.previewProducts(tenantId, mappedRows)
      : await this.previewContacts(tenantId, mappedRows);

    const [currentProductCount, maxProducts] = entity === 'products'
      ? await Promise.all([
          this.prisma.product.count({ where: { tenantId, deletedAt: null } }),
          this.getMaxProductLimit(tenantId),
        ])
      : [null, null] as const;

    if (entity === 'products' && currentProductCount !== null) {
      this.applyProductLimit(rows, currentProductCount, maxProducts);
    }

    const summary = summarize(rows, currentProductCount, maxProducts);
    return {
      entity,
      sourceHeaders: parsed.headers,
      targetFields: [...config.headers],
      rows,
      errors: missingHeaders.map((header) => `${header} kolonu zorunludur.`),
      checklist: buildChecklist(config, missingHeaders, rows, summary),
      summary,
    };
  }

  async commit(
    entity: StarterCsvImportEntity,
    tenantId: string,
    userId: string | undefined,
    input: StarterCsvImportInput,
    meta: StarterCsvImportRequestMeta,
  ): Promise<StarterCsvImportCommitResult> {
    const preview = await this.preview(entity, tenantId, input);
    const invalidRows = preview.rows.filter((row) => !row.valid);
    const rowsToImport = preview.rows.filter(isImportableRow);

    if (preview.errors.length > 0) throw new ValidationError(preview.errors[0] ?? 'CSV basliklari gecersiz.');
    if (!input.partialImport && invalidRows.length > 0) throw new ValidationError('Duzeltilmesi gereken satirlar var. Kismi import secilmedigi icin kayit yapilmadi.');
    if (rowsToImport.length === 0) throw new ValidationError('Ice aktarilabilecek gecerli satir bulunamadi.');

    if (entity === 'products') {
      await this.commitProducts(tenantId, userId, rowsToImport, preview, meta);
    } else {
      await this.commitContacts(tenantId, userId, rowsToImport, preview, meta);
    }

    return {
      entity,
      createdCount: rowsToImport.length,
      skippedCount: preview.summary.totalRows - rowsToImport.length,
      summary: preview.summary,
    };
  }

  private async previewProducts(tenantId: string, rows: Record<string, string>[]): Promise<StarterCsvImportPreviewRow[]> {
    const [references, existingCodes] = await Promise.all([
      this.getProductReferences(tenantId),
      this.getExistingProductCodes(tenantId, rows),
    ]);
    const duplicateCodes = findFileDuplicates(rows, 'code');
    return rows.map((values, index) => this.validateProductRow(values, index + 2, references, existingCodes, duplicateCodes));
  }

  private async previewContacts(tenantId: string, rows: Record<string, string>[]): Promise<StarterCsvImportPreviewRow[]> {
    const existingCodes = await this.getExistingContactCodes(tenantId, rows);
    const duplicateCodes = findFileDuplicates(rows, 'code');
    return rows.map((values, index) => this.validateContactRow(values, index + 2, existingCodes, duplicateCodes));
  }

  private applyProductLimit(rows: StarterCsvImportPreviewRow[], currentProductCount: number, maxProducts: number | null): void {
    if (maxProducts === null) return;
    const remainingSlots = Math.max(0, maxProducts - currentProductCount);
    let acceptedRows = 0;
    for (const row of rows) {
      if (!row.valid) continue;
      acceptedRows += 1;
      if (acceptedRows > remainingSlots) {
        row.errors.push(`Starter urun limiti asiliyor. En fazla ${remainingSlots} yeni urun ice aktarilabilir.`);
        row.valid = false;
        row.normalized = null;
      }
    }
  }

  private async commitProducts(
    tenantId: string,
    userId: string | undefined,
    rowsToImport: Array<StarterCsvImportPreviewRow & { normalized: Record<string, string | number | boolean | null> }>,
    preview: StarterCsvImportPreview,
    meta: StarterCsvImportRequestMeta,
  ): Promise<void> {
    const references = await this.getProductReferences(tenantId);
    const data = rowsToImport.map((row): Prisma.ProductCreateManyInput => ({
      tenantId,
      code: String(row.normalized.code),
      name: String(row.normalized.name),
      unitId: references.unitsByCode.get(normalizeKey(String(row.normalized.unitCode))) ?? '',
      categoryId: typeof row.normalized.categoryName === 'string' ? references.categoriesByName.get(normalizeKey(row.normalized.categoryName)) ?? null : null,
      taxRateId: typeof row.normalized.taxRateName === 'string' ? references.taxRatesByName.get(normalizeKey(row.normalized.taxRateName)) ?? null : null,
      barcode: typeof row.normalized.barcode === 'string' ? row.normalized.barcode : null,
      description: typeof row.normalized.description === 'string' ? row.normalized.description : null,
      purchasePrice: Number(row.normalized.purchasePrice),
      salesPrice: Number(row.normalized.salesPrice),
      minStockLevel: Number(row.normalized.minStockLevel),
      isActive: Boolean(row.normalized.isActive),
      createdById: userId ?? null,
    }));

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
      if (duplicateCodes.length > 0) throw new ValidationError(`Bu urun kodlari zaten kullaniliyor: ${duplicateCodes.map((product) => product.code).join(', ')}.`);

      await tx.product.createMany({ data });
      await createAuditLog(tx, {
        tenantId,
        userId: userId ?? null,
        module: 'inventory',
        entityType: EntityType.PRODUCT,
        entityId: 'starter-csv-import',
        action: AuditAction.CREATE,
        newValues: { createdCount: data.length, skippedCount: preview.summary.totalRows - data.length, entity: 'products' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  }

  private async commitContacts(
    tenantId: string,
    userId: string | undefined,
    rowsToImport: Array<StarterCsvImportPreviewRow & { normalized: Record<string, string | number | boolean | null> }>,
    preview: StarterCsvImportPreview,
    meta: StarterCsvImportRequestMeta,
  ): Promise<void> {
    const data = rowsToImport.map((row): Prisma.ContactCreateManyInput => ({
      tenantId,
      type: row.normalized.type as ContactType,
      code: typeof row.normalized.code === 'string' ? row.normalized.code : null,
      name: String(row.normalized.name),
      taxNumber: typeof row.normalized.taxNumber === 'string' ? row.normalized.taxNumber : null,
      taxOffice: typeof row.normalized.taxOffice === 'string' ? row.normalized.taxOffice : null,
      email: typeof row.normalized.email === 'string' ? row.normalized.email : null,
      phone: typeof row.normalized.phone === 'string' ? row.normalized.phone : null,
      city: typeof row.normalized.city === 'string' ? row.normalized.city : null,
      country: typeof row.normalized.country === 'string' ? row.normalized.country : 'TR',
      paymentTermDays: typeof row.normalized.paymentTermDays === 'number' ? row.normalized.paymentTermDays : null,
      isActive: Boolean(row.normalized.isActive),
      createdById: userId ?? null,
    }));

    await this.prisma.$transaction(async (tx) => {
      const codes = data.map((contact) => contact.code).filter((code): code is string => typeof code === 'string' && code.length > 0);
      const duplicateCodes = codes.length > 0
        ? await tx.contact.findMany({ where: { tenantId, deletedAt: null, code: { in: codes } }, select: { code: true } })
        : [];
      if (duplicateCodes.length > 0) throw new ValidationError(`Bu cari kodlari zaten kullaniliyor: ${duplicateCodes.map((contact) => contact.code).join(', ')}.`);

      await tx.contact.createMany({ data });
      await createAuditLog(tx, {
        tenantId,
        userId: userId ?? null,
        module: 'contacts',
        entityType: EntityType.CONTACT,
        entityId: 'starter-csv-import',
        action: AuditAction.CREATE,
        newValues: { createdCount: data.length, skippedCount: preview.summary.totalRows - data.length, entity: 'contacts' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  }

  private async getMaxProductLimit(tenantId: string): Promise<number | null> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, FeatureKey.MAX_PRODUCTS);
    const parsed = parseLimitValue(feature.value);
    return parsed.isUnlimited ? null : parsed.limit;
  }

  private async getProductReferences(tenantId: string): Promise<ProductReferences> {
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

  private async getExistingProductCodes(tenantId: string, rows: Record<string, string>[]): Promise<Set<string>> {
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code)).filter((code) => code.length > 0)));
    if (codes.length === 0) return new Set();
    const products = await this.prisma.product.findMany({ where: { tenantId, deletedAt: null, code: { in: codes } }, select: { code: true } });
    return new Set(products.map((product) => normalizeKey(product.code)));
  }

  private async getExistingContactCodes(tenantId: string, rows: Record<string, string>[]): Promise<Set<string>> {
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code)).filter((code) => code.length > 0)));
    if (codes.length === 0) return new Set();
    const contacts = await this.prisma.contact.findMany({ where: { tenantId, deletedAt: null, code: { in: codes } }, select: { code: true } });
    return new Set(contacts.map((contact) => normalizeKey(contact.code ?? '')));
  }

  private validateProductRow(values: Record<string, string>, rowNumber: number, references: ProductReferences, existingCodes: Set<string>, duplicateCodes: Set<number>): StarterCsvImportPreviewRow {
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

    const salesPrice = parseNonNegativeNumber(values.salesPrice);
    const purchasePrice = parseNonNegativeNumber(values.purchasePrice);
    const minStockLevel = parseNonNegativeNumber(values.minStockLevel);
    if (!salesPrice.ok) errors.push('salesPrice negatif olmayan sayi olmalidir.');
    if (!purchasePrice.ok) errors.push('purchasePrice negatif olmayan sayi olmalidir.');
    if (!minStockLevel.ok) errors.push('minStockLevel negatif olmayan sayi olmalidir.');
    const isActive = parseBoolean(values.isActive);
    if (!isActive.ok) errors.push('isActive true/false, evet/hayir veya aktif/pasif olmalidir.');
    if (!values.barcode?.trim()) warnings.push('Barkod bos; sonradan eklenebilir.');

    return {
      rowNumber,
      values,
      normalized: errors.length === 0 ? {
        code,
        name,
        unitCode,
        barcode: cleanOptionalText(values.barcode),
        salesPrice: salesPrice.ok ? salesPrice.value : 0,
        purchasePrice: purchasePrice.ok ? purchasePrice.value : 0,
        minStockLevel: minStockLevel.ok ? minStockLevel.value : 0,
        categoryName,
        taxRateName,
        description: cleanOptionalText(values.description),
        isActive: isActive.ok ? isActive.value : true,
      } : null,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateContactRow(values: Record<string, string>, rowNumber: number, existingCodes: Set<string>, duplicateCodes: Set<number>): StarterCsvImportPreviewRow {
    const errors: string[] = [];
    const warnings: string[] = [];
    const type = parseContactType(values.type);
    const code = cleanOptionalText(values.code);
    const name = cleanText(values.name);
    const paymentTermDays = parseNonNegativeInteger(values.paymentTermDays);
    const isActive = parseBoolean(values.isActive);

    if (!type) errors.push('type CUSTOMER, SUPPLIER veya BOTH olmalidir.');
    if (!name) errors.push('name zorunludur.');
    if (code && existingCodes.has(normalizeKey(code))) errors.push(`"${code}" kodu sistemde zaten var.`);
    if (code && duplicateCodes.has(rowNumber - 2)) errors.push(`"${code}" kodu dosyada tekrar ediyor.`);
    if (!paymentTermDays.ok) errors.push('paymentTermDays negatif olmayan tam sayi olmalidir.');
    if (!isActive.ok) errors.push('isActive true/false, evet/hayir veya aktif/pasif olmalidir.');
    if (!cleanOptionalText(values.taxNumber)) warnings.push('Vergi numarasi bos; Starter Health Score bunu uyarabilir.');

    return {
      rowNumber,
      values,
      normalized: errors.length === 0 ? {
        type,
        code,
        name,
        taxNumber: cleanOptionalText(values.taxNumber),
        taxOffice: cleanOptionalText(values.taxOffice),
        email: cleanOptionalText(values.email),
        phone: cleanOptionalText(values.phone),
        city: cleanOptionalText(values.city),
        country: cleanOptionalText(values.country) ?? 'TR',
        paymentTermDays: paymentTermDays.ok && cleanText(values.paymentTermDays) ? paymentTermDays.value : null,
        isActive: isActive.ok ? isActive.value : true,
      } : null,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
