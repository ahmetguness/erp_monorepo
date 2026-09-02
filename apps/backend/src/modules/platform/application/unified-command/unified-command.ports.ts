import type { UnifiedSearchResult } from './unified-command.types.js';

export type UnifiedPermissionAction = 'READ' | 'CREATE';

export interface UnifiedPermissionContext {
  can(action: UnifiedPermissionAction, module: string): boolean;
}

export interface UnifiedPermissionPort {
  getContext(tenantId: string, userId: string): Promise<UnifiedPermissionContext | null>;
}

export interface UnifiedSearchPort {
  search(input: { tenantId: string; userId: string; query: string; limit: number }): Promise<UnifiedSearchResult[] | null>;
}
