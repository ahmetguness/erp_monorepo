import { NAVIGATION_MODULES, goalsFor, inferPersona, isNavigationHref } from './navigation-catalog.js';
import type { NavigationWorkspaceRepository } from './navigation-workspace.ports.js';
import type { NavigationPersona, NavigationPreferences, NavigationWorkspace, NavigationWorkspaceFailure } from './navigation-workspace.types.js';

const MAX_RECENT = 8;
const MAX_USAGE = 1000;

function uniqueAllowed(values: readonly string[], allowed: ReadonlySet<string>): string[] {
  return [...new Set(values)].filter((value) => allowed.has(value));
}

function uniqueHrefs(values: readonly string[]): string[] {
  return [...new Set(values)].filter(isNavigationHref);
}

export class NavigationWorkspaceService {
  constructor(private readonly repository: NavigationWorkspaceRepository) {}

  async get(tenantId: string, userId: string): Promise<NavigationWorkspace | NavigationWorkspaceFailure> {
    const member = await this.repository.findMember(tenantId, userId);
    if (!member) return { kind: 'FORBIDDEN', message: 'Tenant çalışma alanına erişiminiz yok.' };
    const effectivePersona = member.preferences.persona === 'AUTO' ? inferPersona(member.allowedModules) : member.preferences.persona;
    const canAccess = (module: string) => member.isOwner || member.allowedModules.includes(module);
    return {
      ...member.preferences,
      effectivePersona,
      allowedModules: member.isOwner ? '*' : member.allowedModules,
      favoriteHrefs: member.preferences.favoriteHrefs.filter(isNavigationHref),
      hiddenModules: member.preferences.hiddenModules.filter((module) => NAVIGATION_MODULES.has(module)),
      goals: goalsFor(effectivePersona, canAccess),
      canDistributeProfiles: member.isOwner,
    };
  }

  async update(tenantId: string, userId: string, input: { persona: NavigationPersona; favoriteHrefs: string[]; hiddenModules: string[] }): Promise<NavigationWorkspace | NavigationWorkspaceFailure> {
    const member = await this.repository.findMember(tenantId, userId);
    if (!member) return { kind: 'FORBIDDEN', message: 'Tenant çalışma alanına erişiminiz yok.' };
    const preferences: NavigationPreferences = {
      ...member.preferences,
      persona: input.persona,
      favoriteHrefs: uniqueHrefs(input.favoriteHrefs).slice(0, 12),
      hiddenModules: uniqueAllowed(input.hiddenModules, NAVIGATION_MODULES),
    };
    await this.repository.savePreferences(tenantId, userId, preferences);
    return this.get(tenantId, userId);
  }

  async recordActivity(tenantId: string, userId: string, href: string): Promise<NavigationWorkspaceFailure | null> {
    const member = await this.repository.findMember(tenantId, userId);
    if (!member) return { kind: 'FORBIDDEN', message: 'Tenant çalışma alanına erişiminiz yok.' };
    const normalizedHref = href.split('?')[0] ?? href;
    if (!isNavigationHref(normalizedHref)) return { kind: 'VALIDATION', message: 'Bilinmeyen navigasyon hedefi.' };
    const preferences: NavigationPreferences = {
      ...member.preferences,
      recentHrefs: [normalizedHref, ...member.preferences.recentHrefs.filter((item) => item !== normalizedHref)].slice(0, MAX_RECENT),
      usage: { ...member.preferences.usage, [normalizedHref]: Math.min((member.preferences.usage[normalizedHref] ?? 0) + 1, MAX_USAGE) },
    };
    await this.repository.savePreferences(tenantId, userId, preferences);
    return null;
  }

  async distribute(tenantId: string, userId: string, roleId: string, input: Pick<NavigationPreferences, 'persona' | 'favoriteHrefs' | 'hiddenModules'>): Promise<{ updatedUsers: number } | NavigationWorkspaceFailure> {
    const actor = await this.repository.findMember(tenantId, userId);
    if (!actor?.isOwner) return { kind: 'FORBIDDEN', message: 'Menü profili dağıtmak için tenant sahibi olmalısınız.' };
    const count = await this.repository.distributeRoleProfile(tenantId, roleId, {
      persona: input.persona,
      favoriteHrefs: uniqueHrefs(input.favoriteHrefs).slice(0, 12),
      hiddenModules: uniqueAllowed(input.hiddenModules, NAVIGATION_MODULES),
    });
    return count === null ? { kind: 'NOT_FOUND', message: 'Rol bu tenant içinde bulunamadı.' } : { updatedUsers: count };
  }
}
