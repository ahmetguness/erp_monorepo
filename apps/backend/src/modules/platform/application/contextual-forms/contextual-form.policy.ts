import type { ContextualFormKind, ContextualFormPolicy } from './contextual-form.types.js';

const INVOICE_CONTEXTS = new Set(['SALES', 'PURCHASE', 'RETURN_SALES', 'RETURN_PURCHASE']);

export function resolveContextualFormPolicy(formKind: ContextualFormKind, requestedContext: string | undefined): ContextualFormPolicy {
  const context = formKind === 'invoice' && requestedContext && INVOICE_CONTEXTS.has(requestedContext) ? requestedContext : 'DEFAULT';
  if (formKind === 'invoice') return {
    formKind,
    context,
    sections: [
      { id: 'identity', label: 'Fatura bilgileri', level: 'essential', fields: ['type', 'contactId', 'date'] },
      { id: 'lines', label: 'Fatura kalemleri', level: 'essential', fields: ['lines.description', 'lines.productId', 'lines.quantity', 'lines.unitPrice', 'lines.taxRateId'] },
      { id: 'terms', label: 'Vade ve açıklama', level: 'advanced', fields: ['dueDate', 'notes'] },
      { id: 'lineAdjustments', label: 'İskonto ve stopaj', level: 'advanced', fields: ['lines.discount', 'lines.withholdingRateId'] },
    ],
    requiredFields: ['type', 'contactId', 'date', 'lines.description', 'lines.quantity', 'lines.unitPrice'],
    autoSaveIntervalMs: 1_500,
    quickEntry: true,
    allowLineDuplication: true,
    shortcuts: { save: 'Ctrl+Enter', addLine: 'Alt+N' },
  };
  if (formKind === 'contact') return {
    formKind, context: 'DEFAULT',
    sections: [
      { id: 'identity', label: 'Temel bilgiler', level: 'essential', fields: ['type', 'name', 'taxNumber', 'email', 'phone'] },
      { id: 'commercial', label: 'Ticari koşullar', level: 'advanced', fields: ['taxOffice', 'creditLimit', 'paymentTermDays', 'notes'] },
    ],
    requiredFields: ['type', 'name'], autoSaveIntervalMs: 1_500, quickEntry: true, allowLineDuplication: false,
    shortcuts: { save: 'Ctrl+Enter', addLine: 'Alt+N' },
  };
  return {
    formKind, context: 'DEFAULT',
    sections: [
      { id: 'identity', label: 'Temel bilgiler', level: 'essential', fields: ['code', 'name', 'unitId', 'barcode'] },
      { id: 'commercial', label: 'Fiyat ve stok', level: 'advanced', fields: ['purchasePrice', 'salesPrice', 'taxRateId', 'warehouseId', 'initialStock'] },
    ],
    requiredFields: ['code', 'name', 'unitId'], autoSaveIntervalMs: 1_500, quickEntry: true, allowLineDuplication: false,
    shortcuts: { save: 'Ctrl+Enter', addLine: 'Alt+N' },
  };
}
