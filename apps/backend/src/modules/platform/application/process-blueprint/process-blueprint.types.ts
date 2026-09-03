export type BlueprintPermissionAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'EXPORT';
export type BlueprintApprovalModule = 'PURCHASE_REQUEST' | 'LEAVE_REQUEST' | 'INVOICE' | 'SALES_ORDER' | 'PURCHASE_ORDER' | 'SERVICE_REQUEST' | 'OTHER';
export type BlueprintAutomationTrigger = 'LOW_STOCK' | 'OVERDUE_INVOICE' | 'HIGH_VALUE_INVOICE' | 'LOW_MARGIN' | 'CHECK_DUE_SOON';
export type BlueprintAutomationAction = 'CREATE_TASK' | 'CREATE_NOTIFICATION' | 'DRAFT_REMINDER_EMAIL' | 'REQUEST_APPROVAL' | 'CREATE_PURCHASE_REQUEST_DRAFT';
export type BlueprintSection = 'roles' | 'numberSequences' | 'approvalFlows' | 'automationRules' | 'moduleSettings';
export interface BlueprintRole { name: string; description: string | null; permissions: Array<{ module: string; action: BlueprintPermissionAction }> }
export interface BlueprintNumberSequence { module: string; prefix: string; padding: number }
export interface BlueprintApprovalFlow { name: string; module: BlueprintApprovalModule; isActive: boolean; conditions: unknown; steps: Array<{ stepOrder: number; name: string; approverRoleName: string | null; isRequired: boolean }> }
export interface BlueprintAutomationRule { name: string; description: string | null; trigger: BlueprintAutomationTrigger; action: BlueprintAutomationAction; module: string; conditions: unknown; actionConfig: unknown; isActive: boolean }
export interface BlueprintModuleSetting { module: string; key: string; value: string }
export interface ProcessBlueprintContent { roles: BlueprintRole[]; numberSequences: BlueprintNumberSequence[]; approvalFlows: BlueprintApprovalFlow[]; automationRules: BlueprintAutomationRule[]; moduleSettings: BlueprintModuleSetting[] }
export interface ProcessBlueprint { schemaVersion: 1; key: string; name: string; description: string | null; industry: string; version: number; createdAt: string; content: ProcessBlueprintContent }
export interface BlueprintSummary { key: string; name: string; description: string | null; industry: string; version: number; createdAt: string; counts: Record<BlueprintSection, number> }
export interface BlueprintDifference { section: BlueprintSection; key: string; action: 'CREATE' | 'UPDATE' | 'UNCHANGED' }
export interface BlueprintPreview { blueprint: BlueprintSummary; selectedSections: BlueprintSection[]; differences: BlueprintDifference[]; changes: number }
