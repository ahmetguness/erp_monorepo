/**
 * @deprecated Bu dosya backward-compat için korunmaktadır.
 * Yeni kodlar için: import { ... } from './financial/index.js'
 */
export {
  assertJournalBalanced,
  assertValidFinancialDate,
  assertAccountingPeriodOpen,
  resolveOpenFiscalPeriodId,
  assertPaymentAllocationsWithinInvoiceBalance,
} from './financial/index.js';

export type {
  JournalBalanceLine,
  PaymentAllocationCheck,
  FinancialDbClient,
} from './financial/index.js';
