import type {
  AnalyzeImportInput,
  ColumnMapping,
  ImportAnalysis,
  ImportCell,
  ImportIssue,
  ImportRow,
  MappingProfile,
  MappingProfileRepository,
  SaveMappingProfileInput,
} from './bulk-import-assistance.types.js';

const TARGET_FIELDS = {
  contacts: ['name', 'taxNumber', 'email', 'phone', 'city', 'country'],
  products: ['code', 'name', 'barcode', 'salesPrice', 'purchasePrice', 'unit'],
  invoices: ['number', 'date', 'dueDate', 'contactName', 'total', 'currency'],
} as const;

const ALIASES: Readonly<Record<string, string>> = {
  cariadi: 'name', unvan: 'name', ad: 'name', urunadi: 'name', stokadi: 'name',
  vergino: 'taxNumber', vkn: 'taxNumber', eposta: 'email', mail: 'email', telefon: 'phone',
  sehir: 'city', ulke: 'country', stokkodu: 'code', urunkodu: 'code', barkod: 'barcode',
  satisfiyati: 'salesPrice', alisfiyati: 'purchasePrice', birim: 'unit', faturano: 'number',
  tarih: 'date', vadetarihi: 'dueDate', cari: 'contactName', toplam: 'total', doviz: 'currency',
};

function key(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function createImportFingerprint(headers: readonly string[]): string {
  return headers.map(key).sort().join('|');
}

function inferMappings(input: AnalyzeImportInput, profile: MappingProfile | null): ColumnMapping[] {
  const validTargets: readonly string[] = TARGET_FIELDS[input.target];
  return input.headers.map((source) => {
    const learned = profile?.mappings.find((mapping) => key(mapping.source) === key(source));
    if (learned && validTargets.includes(learned.target)) return { ...learned, source, confidence: 1, learned: true };
    const normalized = key(source);
    const exact = validTargets.find((field) => key(field) === normalized);
    const target = exact ?? ALIASES[normalized] ?? '';
    return { source, target: validTargets.includes(target) ? target : '', confidence: exact ? 1 : target ? 0.9 : 0, learned: false };
  });
}

function normalizeCell(value: ImportCell): ImportCell {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const compact = trimmed.replace(/\s+/g, ' ');
  const localizedNumber = compact.match(/^-?\d{1,3}(?:\.\d{3})*,\d+$/);
  if (localizedNumber) return Number(compact.replace(/\./g, '').replace(',', '.'));
  const isoDate = compact.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (isoDate) return `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`;
  return compact;
}

function normalizeRows(rows: readonly ImportRow[], mappings: readonly ColumnMapping[], issues: ImportIssue[]): ImportRow[] {
  return rows.map((row, index) => {
    const normalized: ImportRow = {};
    for (const mapping of mappings) {
      if (!mapping.target) continue;
      const original = row[mapping.source] ?? null;
      const value = normalizeCell(original);
      normalized[mapping.target] = value;
      if (value !== original) issues.push({ row: index + 1, column: mapping.source, severity: 'auto_fixed', code: 'NORMALIZED_VALUE', message: `${mapping.source} değeri standart biçime çevrildi.` });
    }
    return normalized;
  });
}

function detectDuplicates(rows: readonly ImportRow[], issues: ImportIssue[]): number {
  const seen = new Map<string, number>();
  let count = 0;
  rows.forEach((row, index) => {
    const identity = ['taxNumber', 'code', 'barcode', 'number', 'email'].map((field) => row[field]).find((value) => value !== null && value !== undefined && String(value).length > 0);
    if (identity === undefined) return;
    const duplicateOf = seen.get(String(identity).toLocaleLowerCase('tr-TR'));
    if (duplicateOf !== undefined) {
      count += 1;
      issues.push({ row: index + 1, column: null, severity: 'review_required', code: 'POSSIBLE_DUPLICATE', message: `Satır ${duplicateOf} ile olası mükerrer kayıt.` });
    } else seen.set(String(identity).toLocaleLowerCase('tr-TR'), index + 1);
  });
  return count;
}

export class BulkImportAssistanceService {
  constructor(private readonly profiles: MappingProfileRepository) {}

  listProfiles(tenantId: string): Promise<MappingProfile[]> {
    return this.profiles.list(tenantId);
  }

  saveProfile(tenantId: string, input: SaveMappingProfileInput): Promise<MappingProfile> {
    return this.profiles.save(tenantId, input);
  }

  async analyze(tenantId: string, input: AnalyzeImportInput): Promise<ImportAnalysis> {
    const fingerprint = createImportFingerprint(input.headers);
    const profile = (await this.profiles.list(tenantId)).find((item) => item.target === input.target && item.fingerprint === fingerprint) ?? null;
    const mappings = inferMappings(input, profile);
    const issues: ImportIssue[] = mappings.filter((mapping) => !mapping.target).map((mapping) => ({ row: 0, column: mapping.source, severity: 'review_required', code: 'UNMAPPED_COLUMN', message: `${mapping.source} kolonu eşlenemedi.` }));
    const normalizedRows = normalizeRows(input.rows, mappings, issues);
    const duplicateCandidates = detectDuplicates(normalizedRows, issues);
    const autoFixed = issues.filter((issue) => issue.severity === 'auto_fixed').length;
    const reviewRequired = issues.filter((issue) => issue.severity === 'review_required').length;
    return {
      fingerprint, profile, mappings, normalizedRows, issues,
      summary: { totalRows: input.rows.length, autoFixed, reviewRequired, duplicateCandidates, unchangedRows: Math.max(0, input.rows.length - new Set(issues.filter((issue) => issue.row > 0).map((issue) => issue.row)).size) },
      execution: { strategy: 'background_resumable', chunkSize: 500, deltaImport: false, resumeSupported: false, status: 'planning_only' },
    };
  }
}
