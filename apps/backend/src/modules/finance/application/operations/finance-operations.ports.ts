import type { AutoProcessBankTransactionMatchesResult, BankTransactionMatchingWorkbench } from '../../../../services/bank-transaction-matching.service.js';
import type { FinanceExceptionItem, FinanceOperationsPolicy, RecurringFinancePattern } from './finance-operations.types.js';

export interface FinanceOperationsAnalysis {
  lastTransactionAt: Date | null;
  splitExceptions: FinanceExceptionItem[];
  duplicateDrafts: FinanceExceptionItem[];
  recurringPatterns: RecurringFinancePattern[];
}

export interface FinanceOperationsRepository {
  getPolicy(tenantId: string): Promise<FinanceOperationsPolicy>;
  savePolicy(tenantId: string, policy: FinanceOperationsPolicy): Promise<void>;
  analyze(tenantId: string, policy: FinanceOperationsPolicy): Promise<FinanceOperationsAnalysis>;
}

export interface BankMatchingGateway {
  workbench(tenantId: string): Promise<BankTransactionMatchingWorkbench>;
  autoProcess(tenantId: string, input: { minConfidence: number; limit: number }): Promise<AutoProcessBankTransactionMatchesResult>;
}
