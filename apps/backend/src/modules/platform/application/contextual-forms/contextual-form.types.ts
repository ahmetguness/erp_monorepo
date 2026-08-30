export const CONTEXTUAL_FORM_KINDS = ['invoice', 'contact', 'product'] as const;
export type ContextualFormKind = (typeof CONTEXTUAL_FORM_KINDS)[number];
export type ContextualFormSectionLevel = 'essential' | 'advanced';

export interface ContextualFormSection {
  id: string;
  label: string;
  level: ContextualFormSectionLevel;
  fields: readonly string[];
  visibleWhen?: { field: string; oneOf: readonly string[] };
}

export interface ContextualFormPolicy {
  formKind: ContextualFormKind;
  context: string;
  sections: readonly ContextualFormSection[];
  requiredFields: readonly string[];
  autoSaveIntervalMs: number;
  quickEntry: boolean;
  allowLineDuplication: boolean;
  shortcuts: Readonly<Record<'save' | 'addLine', string>>;
}
