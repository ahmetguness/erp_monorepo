import type { BankMatchingGateway, FinanceOperationsRepository } from './finance-operations.ports.js';
import type { FinanceExceptionItem, FinanceOperationsPolicy, FinanceOperationsRunResult, FinanceOperationsWorkspace } from './finance-operations.types.js';

export function sanitizeFinanceOperationsPolicy(input: FinanceOperationsPolicy): FinanceOperationsPolicy {
  return {
    autoProcessEnabled: input.autoProcessEnabled,
    autoMatchMinConfidence: Math.min(100, Math.max(75, Math.trunc(input.autoMatchMinConfidence))),
    feedStaleHours: Math.min(168, Math.max(1, Math.trunc(input.feedStaleHours))),
    duplicateWindowDays: Math.min(90, Math.max(1, Math.trunc(input.duplicateWindowDays))),
  };
}

export class FinanceOperationsService {
  constructor(private readonly repository: FinanceOperationsRepository, private readonly matching: BankMatchingGateway) {}

  async getWorkspace(tenantId: string, now = new Date()): Promise<FinanceOperationsWorkspace> {
    const policy = await this.repository.getPolicy(tenantId);
    const [workbench, analysis] = await Promise.all([this.matching.workbench(tenantId), this.repository.analyze(tenantId, policy)]);
    const matchExceptions: FinanceExceptionItem[] = workbench.queue
      .filter((item) => item.status !== 'READY_FOR_APPROVAL' && !analysis.splitExceptions.some((exception) => exception.sourceIds.includes(item.transactionId)))
      .map((item) => ({
        id: `bank:${item.transactionId}`,
        kind: item.status === 'NO_CANDIDATE' ? 'NO_CANDIDATE' : 'LOW_CONFIDENCE',
        title: item.description || item.reference || 'Eşleşmeyen banka hareketi',
        detail: item.bestSuggestion ? `En iyi aday %${item.bestSuggestion.confidenceScore} güven seviyesinde.` : 'Uygun ödeme veya fatura adayı bulunamadı.',
        amount: item.amount,
        confidence: item.bestSuggestion?.confidenceScore ?? null,
        href: `/dashboard/bank-transactions?transactionId=${encodeURIComponent(item.transactionId)}`,
        sourceIds: [item.transactionId],
      }));
    const lastAt = analysis.lastTransactionAt;
    const stale = !lastAt || now.getTime() - lastAt.getTime() > policy.feedStaleHours * 60 * 60 * 1000;
    const feedException: FinanceExceptionItem[] = stale ? [{ id: 'bank-feed:stale', kind: 'FEED_STALE', title: 'Banka beslemesi güncel değil', detail: lastAt ? `Son hareket ${lastAt.toISOString()} tarihinde alındı.` : 'Henüz banka hareketi alınmadı.', amount: null, confidence: null, href: '/dashboard/bank-transactions', sourceIds: [] }] : [];
    const exceptions = [...feedException, ...analysis.splitExceptions, ...analysis.duplicateDrafts, ...matchExceptions];
    return {
      generatedAt: now.toISOString(), policy,
      feed: { lastTransactionAt: lastAt?.toISOString() ?? null, stale },
      summary: { automaticallyProcessed: 0, readyForAutomaticProcessing: workbench.summary.readyForBulkApproval, exceptions: exceptions.length, recurringPatterns: analysis.recurringPatterns.length },
      exceptions, recurringPatterns: analysis.recurringPatterns,
    };
  }

  async updatePolicy(tenantId: string, input: FinanceOperationsPolicy): Promise<FinanceOperationsPolicy> {
    const policy = sanitizeFinanceOperationsPolicy(input);
    await this.repository.savePolicy(tenantId, policy);
    return policy;
  }

  async run(tenantId: string): Promise<FinanceOperationsRunResult> {
    const policy = await this.repository.getPolicy(tenantId);
    const result = policy.autoProcessEnabled
      ? await this.matching.autoProcess(tenantId, { minConfidence: policy.autoMatchMinConfidence, limit: 100 })
      : { scanned: 0, processed: 0, paymentsCreated: 0, approvedExistingPayments: 0, skipped: 0, items: [] };
    const workspace = await this.getWorkspace(tenantId);
    workspace.summary.automaticallyProcessed = result.processed;
    return { scanned: result.scanned, processed: result.processed, skipped: result.skipped, workspace };
  }
}
