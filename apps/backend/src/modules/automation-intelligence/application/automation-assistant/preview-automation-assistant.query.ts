import type { AutomationAssistantRepository } from './automation-assistant.port.js';
import type { AutomationAssistantPreview } from './automation-assistant.types.js';
import { compileAutomationIntent } from './automation-language.compiler.js';

export class PreviewAutomationAssistantQuery {
  constructor(private readonly repository: AutomationAssistantRepository) {}

  async execute(tenantId: string, prompt: string): Promise<AutomationAssistantPreview> {
    const compiled = compileAutomationIntent(prompt);
    const [simulation, existing] = await Promise.all([
      this.repository.simulate(tenantId, compiled.draft.trigger),
      this.repository.listExisting(tenantId),
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
    };
  }
}
