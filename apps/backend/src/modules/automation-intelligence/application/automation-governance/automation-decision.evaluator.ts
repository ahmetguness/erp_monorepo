import type { AutomationDecisionExplanation, AutomationDecisionInput, AutomationGovernancePolicy, AutomationRiskLevel } from './automation-decision.types.js';

const IRREVERSIBLE_ACTIONS = new Set<AutomationDecisionInput['action']>([]);

function riskLevel(input: AutomationDecisionInput, policy: AutomationGovernancePolicy): AutomationRiskLevel {
  if (input.estimatedMonetaryAmount !== null && input.estimatedMonetaryAmount >= policy.approvalThreshold) return 'HIGH';
  if (input.action === 'REQUEST_APPROVAL' || input.action === 'CREATE_PURCHASE_REQUEST_DRAFT') return 'MEDIUM';
  return 'LOW';
}

export function evaluateAutomationDecision(
  input: AutomationDecisionInput,
  policy: AutomationGovernancePolicy,
): AutomationDecisionExplanation {
  const normalizedConfidence = Math.min(1, Math.max(0, input.confidence));
  const requiresApproval = (input.estimatedMonetaryAmount ?? 0) >= policy.approvalThreshold
    || normalizedConfidence < policy.minimumAutomaticConfidence
    || IRREVERSIBLE_ACTIONS.has(input.action);
  const reversible = !IRREVERSIBLE_ACTIONS.has(input.action);
  const level = riskLevel(input, policy);
  return {
    version: 1,
    reason: input.reason,
    sources: input.sources,
    confidence: { score: normalizedConfidence, band: normalizedConfidence >= 0.85 ? 'HIGH' : normalizedConfidence >= 0.65 ? 'MEDIUM' : 'LOW' },
    risk: {
      level,
      reasons: [
        ...(requiresApproval ? ['Tenant güven politikası kullanıcı onayı gerektiriyor.'] : ['Tenant güven politikası otomatik çalışmaya izin veriyor.']),
        ...(input.estimatedMonetaryAmount !== null ? [`Tahmini parasal etki ${input.estimatedMonetaryAmount.toFixed(2)} TRY.`] : []),
      ],
    },
    impact: { matchedRecords: input.matchedRecords, estimatedMonetaryAmount: input.estimatedMonetaryAmount, currency: 'TRY' },
    control: {
      mode: input.dryRun ? 'DRY_RUN' : requiresApproval ? 'APPROVAL_REQUIRED' : 'AUTOMATIC',
      requiresApproval,
      approvalThreshold: policy.approvalThreshold,
      dryRun: input.dryRun,
      idempotencyKey: `automation:${input.tenantId}:${input.ruleId}:${input.trigger}:${input.action}`,
      reversible,
      compensation: reversible ? 'Oluşturulan görev/bildirim kaynak anahtarıyla bulunup kapatılabilir.' : 'Ters kayıt veya yetkili kullanıcı müdahalesi gerekir.',
    },
    trigger: input.trigger,
    action: input.action,
  };
}
