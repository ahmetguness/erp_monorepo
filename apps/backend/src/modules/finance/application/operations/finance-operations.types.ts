export interface FinanceOperationsPolicy {
  autoProcessEnabled: boolean;
  autoMatchMinConfidence: number;
  feedStaleHours: number;
  duplicateWindowDays: number;
}

export type FinanceExceptionKind = 'LOW_CONFIDENCE' | 'NO_CANDIDATE' | 'POSSIBLE_SPLIT' | 'DUPLICATE_DRAFT' | 'FEED_STALE';

export interface FinanceExceptionItem {
  id: string;
  kind: FinanceExceptionKind;
  title: string;
  detail: string;
  amount: number | null;
  confidence: number | null;
  href: string;
  sourceIds: string[];
}

export interface RecurringFinancePattern {
  key: string;
  description: string;
  occurrences: number;
  averageAmount: number;
  suggestedAction: 'CREATE_RECURRING_EXPENSE_DRAFT' | 'LEARN_DESCRIPTION';
}

export interface FinanceOperationsWorkspace {
  generatedAt: string;
  policy: FinanceOperationsPolicy;
  feed: { lastTransactionAt: string | null; stale: boolean };
  summary: { automaticallyProcessed: number; readyForAutomaticProcessing: number; exceptions: number; recurringPatterns: number };
  exceptions: FinanceExceptionItem[];
  recurringPatterns: RecurringFinancePattern[];
}

export interface FinanceOperationsRunResult {
  scanned: number;
  processed: number;
  skipped: number;
  workspace: FinanceOperationsWorkspace;
}
