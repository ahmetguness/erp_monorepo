// ─────────────────────────────────────────────
// financial/ — Public API
// ─────────────────────────────────────────────

// Types
export type {
  FinancialDbClient,
  FinancialReverseInput,
  TrialBalanceRow,
  TrialBalanceInput,
  AccountStatementRow,
  ContactStatementInput,
  ContactBalanceSummary,
  PeriodLockResult,
} from './types.js';

// Period Guard
export {
  assertJournalBalanced,
  assertValidFinancialDate,
  assertAccountingPeriodOpen,
  resolveOpenFiscalPeriodId,
  assertPaymentAllocationsWithinInvoiceBalance,
  assertPaymentReversible,
  assertPaymentEditable,
  assertPayrollReversible,
  assertInvoiceCancelable,
  assertInvoiceEditable,
  readRequiredReason,
} from './period-guard.js';

export type {
  JournalBalanceLine,
  PaymentAllocationCheck,
} from './period-guard.js';

// Trial Balance
export {
  computeTrialBalance,
  assertTrialBalanceBalanced,
} from './trial-balance.js';

// Account Entry Reconciliation
export {
  getContactStatement,
  verifyContactAccountBalance,
} from './account-entry-reconciliation.js';

// Payment Reverse
export { reversePayment } from './payment-reverse.js';
export type { ReversePaymentInput } from './payment-reverse.js';

// Payroll Reverse
export { reversePayroll } from './payroll-reverse.js';
export type { ReversePayrollInput } from './payroll-reverse.js';
