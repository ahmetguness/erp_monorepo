export type NavigationPersona = 'AUTO' | 'SALES' | 'FINANCE' | 'OPERATIONS' | 'PEOPLE' | 'MANAGEMENT';

export interface NavigationPreferences {
  persona: NavigationPersona;
  favoriteHrefs: string[];
  hiddenModules: string[];
  recentHrefs: string[];
  usage: Record<string, number>;
}

export interface NavigationGoal {
  id: string;
  label: string;
  description: string;
  href: string;
  module: string | null;
}

export interface NavigationWorkspace {
  persona: NavigationPersona;
  effectivePersona: Exclude<NavigationPersona, 'AUTO'>;
  allowedModules: string[] | '*';
  favoriteHrefs: string[];
  hiddenModules: string[];
  recentHrefs: string[];
  usage: Record<string, number>;
  goals: NavigationGoal[];
  canDistributeProfiles: boolean;
}

export interface NavigationWorkspaceFailure {
  kind: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION';
  message: string;
}
