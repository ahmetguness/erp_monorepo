import type { UnifiedPermissionAction, UnifiedPermissionContext } from './unified-command.ports.js';
import type { UnifiedIntentPreview } from './unified-command.types.js';

interface IntentDefinition {
  id: string;
  title: string;
  explanation: string;
  keywords: readonly string[];
  module: string;
  action: UnifiedPermissionAction;
  risk: UnifiedIntentPreview['risk'];
  href: string;
  requiresConfirmation: boolean;
}

const INTENTS: readonly IntentDefinition[] = [
  { id: 'CREATE_CONTACT', title: 'Yeni cari oluştur', explanation: 'Yeni cari kartı formunu açar.', keywords: ['yeni cari', 'müşteri oluştur', 'tedarikçi oluştur'], module: 'contacts', action: 'CREATE', risk: 'MEDIUM', href: '/dashboard/contacts/new', requiresConfirmation: true },
  { id: 'CREATE_SALES_QUOTE', title: 'Satış teklifi oluştur', explanation: 'Satış teklifi taslağı oluşturma ekranını açar.', keywords: ['teklif oluştur', 'yeni teklif', 'siparişi kopyala', 'sipariş kopyala'], module: 'invoicing', action: 'CREATE', risk: 'MEDIUM', href: '/dashboard/sales-orders/quotes/new', requiresConfirmation: true },
  { id: 'CREATE_PAYMENT', title: 'Ödeme veya tahsilat kaydı oluştur', explanation: 'Ödeme taslağı ekranını açar.', keywords: ['ödeme ekle', 'tahsilat ekle', 'ödeme oluştur'], module: 'accounting', action: 'CREATE', risk: 'HIGH', href: '/dashboard/payments/new', requiresConfirmation: true },
  { id: 'VIEW_OVERDUE_INVOICES', title: 'Vadesi geçen faturaları göster', explanation: 'Fatura listesini vadesi geçen kayıtları incelemek üzere açar.', keywords: ['vadesi geçen', 'geciken fatura', 'ödenmemiş fatura'], module: 'invoicing', action: 'READ', risk: 'LOW', href: '/dashboard/invoices?status=overdue', requiresConfirmation: false },
  { id: 'IMPORT_DOCUMENT', title: 'Belgeden taslak oluştur', explanation: 'Belge merkezindeki kontrollü çıkarım ve taslak akışını açar.', keywords: ['pdf', 'belgeden', 'fatura taslağı', 'belge aktar'], module: 'attachments', action: 'CREATE', risk: 'MEDIUM', href: '/dashboard/documents?intent=extract-draft', requiresConfirmation: true },
  { id: 'SEND_MAIL', title: 'E-posta taslağı oluştur', explanation: 'Mail merkezini yeni taslak bağlamıyla açar.', keywords: ['mail gönder', 'e-posta gönder', 'eposta gönder'], module: 'mail', action: 'CREATE', risk: 'MEDIUM', href: '/dashboard/mail?compose=true', requiresConfirmation: true },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function scoreIntent(query: string, definition: IntentDefinition): number {
  const normalized = normalize(query);
  const scores = definition.keywords
    .filter((keyword) => normalized.includes(keyword))
    .map((keyword) => Math.min(0.98, 0.62 + keyword.length / Math.max(normalized.length, 1) * 0.36));
  return scores.length > 0 ? Math.max(...scores) : 0;
}

export function resolveUnifiedIntent(query: string, permissions: UnifiedPermissionContext): UnifiedIntentPreview | null {
  const matches = INTENTS
    .filter((definition) => permissions.can(definition.action, definition.module))
    .map((definition) => ({ definition, score: scoreIntent(query, definition) }))
    .filter((match) => match.score >= 0.62)
    .sort((left, right) => right.score - left.score);

  const best = matches[0];
  if (!best) return null;

  const alternatives = matches
    .filter((match) => best.score - match.score < 0.12)
    .slice(0, 3);
  const ambiguous = alternatives.length > 1;

  return {
    id: best.definition.id,
    title: best.definition.title,
    explanation: ambiguous ? 'İfade birden fazla işleme uyuyor. Devam etmeden önce hedef işlemi seçin.' : best.definition.explanation,
    confidence: Number(best.score.toFixed(2)),
    risk: best.definition.risk,
    status: ambiguous ? 'NEEDS_CLARIFICATION' : 'READY',
    requiresConfirmation: best.definition.requiresConfirmation,
    href: ambiguous ? null : best.definition.href,
    options: alternatives.map(({ definition }) => ({ id: definition.id, label: definition.title, description: definition.explanation, href: definition.href })),
  };
}

export function getIntentHandoff(intentId: string, query: string, permissions: UnifiedPermissionContext): string | null {
  const definition = INTENTS.find((candidate) => candidate.id === intentId);
  if (!definition || !permissions.can(definition.action, definition.module)) return null;
  const separator = definition.href.includes('?') ? '&' : '?';
  return `${definition.href}${separator}command=${encodeURIComponent(query)}`;
}
