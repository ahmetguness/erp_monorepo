export type ImportTarget = 'contacts' | 'products' | 'invoices';
export type ImportCell = string | number | boolean | null;
export type ImportRow = Record<string, ImportCell>;

export interface ColumnMapping {
  source: string;
  target: string;
  confidence: number;
  learned: boolean;
}

export interface MappingProfile {
  id: string;
  name: string;
  target: ImportTarget;
  fingerprint: string;
  mappings: ColumnMapping[];
  updatedAt: string;
}

export interface ImportIssue {
  row: number;
  column: string | null;
  severity: 'auto_fixed' | 'review_required';
  code: 'NORMALIZED_VALUE' | 'POSSIBLE_DUPLICATE' | 'UNMAPPED_COLUMN';
  message: string;
}

export interface ImportAnalysis {
  fingerprint: string;
  profile: MappingProfile | null;
  mappings: ColumnMapping[];
  normalizedRows: ImportRow[];
  issues: ImportIssue[];
  summary: {
    totalRows: number;
    autoFixed: number;
    reviewRequired: number;
    duplicateCandidates: number;
    unchangedRows: number;
  };
  execution: {
    strategy: 'background_resumable';
    chunkSize: number;
    deltaImport: boolean;
    resumeSupported: boolean;
    status: 'planning_only';
  };
}

export interface AnalyzeImportInput {
  target: ImportTarget;
  headers: string[];
  rows: ImportRow[];
}

export interface SaveMappingProfileInput {
  name: string;
  target: ImportTarget;
  headers: string[];
  mappings: ColumnMapping[];
}

export interface MappingProfileRepository {
  list(tenantId: string): Promise<MappingProfile[]>;
  save(tenantId: string, input: SaveMappingProfileInput): Promise<MappingProfile>;
}
