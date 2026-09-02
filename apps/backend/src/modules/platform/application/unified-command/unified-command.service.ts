import { getIntentHandoff, resolveUnifiedIntent } from './unified-intent-resolver.js';
import type { UnifiedPermissionPort, UnifiedSearchPort } from './unified-command.ports.js';
import type { ConfirmUnifiedCommandInput, UnifiedCommandFailure, UnifiedCommandHandoff, UnifiedCommandInput, UnifiedCommandResponse } from './unified-command.types.js';

export class UnifiedCommandService {
  constructor(private readonly searchPort: UnifiedSearchPort, private readonly permissionPort: UnifiedPermissionPort) {}

  async preview(input: UnifiedCommandInput): Promise<UnifiedCommandResponse | UnifiedCommandFailure> {
    const permissions = await this.permissionPort.getContext(input.tenantId, input.userId);
    if (!permissions) return { kind: 'FORBIDDEN', message: "Bu tenant'a erişiminiz yok." };
    const results = await this.searchPort.search(input);
    if (!results) return { kind: 'FORBIDDEN', message: "Bu tenant'a erişiminiz yok." };
    const intent = input.query.length >= 2 ? resolveUnifiedIntent(input.query, permissions) : null;
    const contextualShortcuts = results
      .filter((item) => item.kind === 'action' || input.recentHrefs.includes(item.href))
      .slice(0, 4);

    return {
      query: input.query,
      mode: intent ? (intent.status === 'NEEDS_CLARIFICATION' ? 'AMBIGUOUS' : 'COMMAND') : 'SEARCH',
      results,
      intent,
      contextualShortcuts,
    };
  }

  async confirm(input: ConfirmUnifiedCommandInput): Promise<UnifiedCommandHandoff | UnifiedCommandFailure> {
    if (!input.confirmed) return { kind: 'VALIDATION', message: 'İşlem açık kullanıcı onayı gerektirir.' };
    const permissions = await this.permissionPort.getContext(input.tenantId, input.userId);
    if (!permissions) return { kind: 'FORBIDDEN', message: "Bu tenant'a erişiminiz yok." };

    const preview = resolveUnifiedIntent(input.query, permissions);
    if (!preview) return { kind: 'VALIDATION', message: 'Komut artık erişilebilir veya geçerli değil.' };
    if (input.intentId !== preview.id) return { kind: 'VALIDATION', message: 'Niyet önizlemesi değişti; yeniden doğrulayın.' };
    const selectedIntentId = preview.status === 'NEEDS_CLARIFICATION' ? input.selectedOptionId : preview.id;
    if (!selectedIntentId) return { kind: 'VALIDATION', message: 'Devam etmek için bir işlem seçilmelidir.' };
    const allowedOptionIds = preview.options.map((option) => option.id);
    if (preview.status === 'NEEDS_CLARIFICATION' && !allowedOptionIds.includes(selectedIntentId)) {
      return { kind: 'VALIDATION', message: 'Belirsiz komut için geçerli bir işlem seçilmelidir.' };
    }

    const href = getIntentHandoff(selectedIntentId, input.query, permissions);
    if (!href) return { kind: 'FORBIDDEN', message: 'Bu işlem için yetkiniz yok.' };
    return { intentId: selectedIntentId, href, message: 'Onaylandı. Güvenli taslak akışına yönlendiriliyorsunuz.', mutationExecuted: false };
  }
}
