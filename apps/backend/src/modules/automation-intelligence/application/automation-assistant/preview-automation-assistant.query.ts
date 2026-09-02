import type { AutomationAssistantRepository } from './automation-assistant.port.js';
import type { AutomationAssistantPreview } from './automation-assistant.types.js';
import { compileAutomationIntent } from './automation-language.compiler.js';
import { evaluateAutomationDecision, type AutomationGovernancePolicyRepository } from '../automation-governance/index.js';

export class PreviewAutomationAssistantQuery {
  constructor(
    private readonly repository: AutomationAssistantRepository,
    private readonly policyRepository: AutomationGovernancePolicyRepository,
  ) {}

  async execute(tenantId: string, prompt: string): Promise<AutomationAssistantPreview> {
    const compiled = compileAutomationIntent(prompt);
    const [simulation, existing, policy] = await Promise.all([
      this.repository.simulate(tenantId, compiled.draft.trigger),
      this.repository.listExisting(tenantId),
      this.policyRepository.get(tenantId),
    ]);
    const conflicts = existing
      .filter((rule) => rule.trigger === compiled.draft.trigger)
      .map((rule) => ({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.action === compiled.draft.action ? 'WARNING' as const : 'INFO' as const,
        reason: rule.action === compiled.draft.action
          ? 'Aynı tetikleyici ve aksiyon tekrar görev veya bildirim üretebilir.'
          : 'Aynı tetikleyiciyi kullanan başka bir kural bulunuyor.',
      }));
    return {
      ...compiled,
      simulation,
      conflicts,
      recommendedMode: 'SUGGESTION',
      safeguards: ['Kural pasif oluşturulur.', 'Simülasyon veri değiştirmez.', 'Etkinleştirme kullanıcı onayı gerektirir.'],
      decision: evaluateAutomationDecision({
        tenantId,
        ruleId: 'assistant-preview',
        trigger: compiled.draft.trigger,
        action: compiled.draft.action,
        reason: compiled.interpretation,
        sources: ['Tenant otomasyon kuralları', 'Tenant operasyon kayıtları', 'Kural tarif kataloğu'],
        confidence: compiled.confidence,
        matchedRecords: simulation.matchedCount,
        estimatedMonetaryAmount: simulation.estimatedMonetaryAmount,
        dryRun: true,
      }, policy),
    };
  }
}
