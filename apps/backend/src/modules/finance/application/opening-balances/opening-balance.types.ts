export interface ContactOpeningBalanceInput {
  contactCode: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface BankOpeningBalanceInput {
  bankAccountId: string;
  balance: number;
  description?: string;
}

export interface LedgerOpeningBalanceInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface OpeningBalanceInput {
  openingDate: string;
  reference: string;
  contacts: ContactOpeningBalanceInput[];
  banks: BankOpeningBalanceInput[];
  ledger: LedgerOpeningBalanceInput[];
}

export interface OpeningBalanceIssue {
  scope: "period" | "contacts" | "banks" | "ledger";
  row: number | null;
  message: string;
}

export interface OpeningBalancePreview {
  importId: string;
  openingDate: string;
  valid: boolean;
  replayed: boolean;
  issues: OpeningBalanceIssue[];
  totals: {
    contactDebit: number;
    contactCredit: number;
    bankBalance: number;
    ledgerDebit: number;
    ledgerCredit: number;
  };
  closedPriorPeriod: { id: string; name: string; endDate: string } | null;
}

export interface OpeningBalanceCommitResult extends OpeningBalancePreview {
  accountEntriesCreated: number;
  bankTransactionsCreated: number;
  journalEntryId: string;
  journalEntryNumber: string;
}
