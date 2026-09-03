import { describe, expect, it } from 'vitest';
import { FinanceOperationsService, sanitizeFinanceOperationsPolicy, type BankMatchingGateway, type FinanceOperationsPolicy, type FinanceOperationsRepository } from '../../src/modules/finance/application/operations/index.js';

const policy: FinanceOperationsPolicy = { autoProcessEnabled: true, autoMatchMinConfidence: 95, feedStaleHours: 24, duplicateWindowDays: 14 };
class Repository implements FinanceOperationsRepository {
  async getPolicy() { return policy; }
  async savePolicy() {}
  async analyze() { return { lastTransactionAt: new Date('2026-09-03T10:00:00Z'), splitExceptions: [], duplicateDrafts: [], recurringPatterns: [] }; }
}
class Matching implements BankMatchingGateway {
  async workbench() { return { rules: [], queue: [{ transactionId: 'tx-1', date: '2026-09-03', description: 'Belirsiz ödeme', reference: null, amount: 100, bankAccountName: 'Banka', bestSuggestion: null, status: 'NO_CANDIDATE' as const }], summary: { unmatched: 1, readyForBulkApproval: 0, needsReview: 0, noCandidate: 1 }, bulkApprovalPolicy: { minConfidence: 75, allowedStrength: 'HIGH' as const } }; }
  async autoProcess() { return { scanned: 1, processed: 1, paymentsCreated: 1, approvedExistingPayments: 0, skipped: 0, items: [] }; }
}

describe('finance operations service', () => {
  it('places only decision-requiring records in the daily exception queue', async () => {
    const result = await new FinanceOperationsService(new Repository(), new Matching()).getWorkspace('tenant', new Date('2026-09-03T11:00:00Z'));
    expect(result.feed.stale).toBe(false);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]?.kind).toBe('NO_CANDIDATE');
  });
  it('runs high-confidence automation and returns the refreshed workspace', async () => {
    const result = await new FinanceOperationsService(new Repository(), new Matching()).run('tenant');
    expect(result.processed).toBe(1);
    expect(result.workspace.summary.automaticallyProcessed).toBe(1);
  });
  it('keeps tenant policy within safe automation limits', () => {
    expect(sanitizeFinanceOperationsPolicy({ autoProcessEnabled: true, autoMatchMinConfidence: 10, feedStaleHours: 0, duplicateWindowDays: 200 })).toEqual({ autoProcessEnabled: true, autoMatchMinConfidence: 75, feedStaleHours: 1, duplicateWindowDays: 90 });
  });
});
