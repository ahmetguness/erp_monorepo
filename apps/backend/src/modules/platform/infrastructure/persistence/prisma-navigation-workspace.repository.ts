import { PermissionAction, Prisma, type PrismaClient } from '@prisma/client';
import type { NavigationPreferences, NavigationWorkspaceRepository } from '../../application/navigation-workspace/index.js';

const PREFERENCE_KEY = 'navigationWorkspace';
const DEFAULT_PREFERENCES: NavigationPreferences = { persona: 'AUTO', favoriteHrefs: [], hiddenModules: [], recentHrefs: [], usage: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parsePreferences(value: Prisma.JsonValue | null): NavigationPreferences {
  if (!isRecord(value) || !isRecord(value[PREFERENCE_KEY])) return { ...DEFAULT_PREFERENCES };
  const raw = value[PREFERENCE_KEY];
  const personas = new Set(['AUTO', 'SALES', 'FINANCE', 'OPERATIONS', 'PEOPLE', 'MANAGEMENT']);
  const persona = typeof raw.persona === 'string' && personas.has(raw.persona) ? raw.persona as NavigationPreferences['persona'] : 'AUTO';
  const usage = isRecord(raw.usage)
    ? Object.fromEntries(Object.entries(raw.usage).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
    : {};
  return { persona, favoriteHrefs: stringArray(raw.favoriteHrefs), hiddenModules: stringArray(raw.hiddenModules), recentHrefs: stringArray(raw.recentHrefs), usage };
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toInputJson);
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = toInputJson(item);
  }
  return result;
}

function mergePreferences(current: Prisma.JsonValue | null, navigation: NavigationPreferences): Prisma.InputJsonObject {
  const root: Record<string, Prisma.InputJsonValue | null> = {};
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    for (const [key, item] of Object.entries(current)) {
      if (item !== undefined) root[key] = toInputJson(item);
    }
  }
  root[PREFERENCE_KEY] = {
    persona: navigation.persona,
    favoriteHrefs: navigation.favoriteHrefs,
    hiddenModules: navigation.hiddenModules,
    recentHrefs: navigation.recentHrefs,
    usage: navigation.usage,
  };
  return root;
}

export class PrismaNavigationWorkspaceRepository implements NavigationWorkspaceRepository {
  constructor(private readonly db: PrismaClient) {}

  async findMember(tenantId: string, userId: string) {
    const member = await this.db.tenantUser.findFirst({
      where: { tenantId, userId, isActive: true, user: { isActive: true }, tenant: { deletedAt: null } },
      select: { tenantId: true, userId: true, roleId: true, isOwner: true, preferences: true, roleRef: { select: { permissions: { where: { action: PermissionAction.READ }, select: { module: true } } } } },
    });
    if (!member) return null;
    return {
      tenantId: member.tenantId,
      userId: member.userId,
      roleId: member.roleId,
      isOwner: member.isOwner,
      allowedModules: [...new Set(member.roleRef?.permissions.map((permission) => permission.module) ?? [])],
      preferences: parsePreferences(member.preferences),
    };
  }

  async savePreferences(tenantId: string, userId: string, preferences: NavigationPreferences): Promise<void> {
    const current = await this.db.tenantUser.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { preferences: true } });
    if (!current) return;
    await this.db.tenantUser.update({ where: { tenantId_userId: { tenantId, userId } }, data: { preferences: mergePreferences(current.preferences, preferences) } });
  }

  async distributeRoleProfile(tenantId: string, roleId: string, profile: Pick<NavigationPreferences, 'persona' | 'favoriteHrefs' | 'hiddenModules'>): Promise<number | null> {
    const role = await this.db.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true } });
    if (!role) return null;
    const members = await this.db.tenantUser.findMany({ where: { tenantId, roleId, isActive: true }, select: { id: true, preferences: true } });
    await this.db.$transaction(members.map((member) => {
      const currentNavigation = parsePreferences(member.preferences);
      return this.db.tenantUser.update({
        where: { id: member.id },
        data: { preferences: mergePreferences(member.preferences, { ...currentNavigation, ...profile }) },
      });
    }));
    return members.length;
  }
}
