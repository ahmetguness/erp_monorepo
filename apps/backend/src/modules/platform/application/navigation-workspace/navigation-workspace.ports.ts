import type { NavigationPreferences } from './navigation-workspace.types.js';

export interface NavigationMember {
  tenantId: string;
  userId: string;
  roleId: string | null;
  isOwner: boolean;
  allowedModules: string[];
  preferences: NavigationPreferences;
}

export interface NavigationWorkspaceRepository {
  findMember(tenantId: string, userId: string): Promise<NavigationMember | null>;
  savePreferences(tenantId: string, userId: string, preferences: NavigationPreferences): Promise<void>;
  distributeRoleProfile(tenantId: string, roleId: string, preferences: Pick<NavigationPreferences, 'persona' | 'favoriteHrefs' | 'hiddenModules'>): Promise<number | null>;
}
