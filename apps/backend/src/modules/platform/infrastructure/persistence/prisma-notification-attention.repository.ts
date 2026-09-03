import { Prisma, type PrismaClient } from '@prisma/client';
import type { AttentionEventType, AttentionMetrics, NotificationAttentionPreferences, NotificationAttentionRepository } from '../../application/notification-attention/index.js';

const PREFERENCE_KEY = 'notificationAttention';
const DEFAULT_PREFERENCES: NotificationAttentionPreferences = {
  quietHours: { enabled: true, start: '20:00', end: '08:00', timezone: 'Europe/Istanbul' },
  digest: { cadence: 'DAILY', hour: 9, weekday: 1 },
  channels: { inApp: true, email: false },
  mutedModules: [],
  escalation: { enabled: false, afterHours: 24, targetRoleId: null },
};
const EMPTY_METRICS: AttentionMetrics = { impressions: 0, actions: 0, dismissals: 0, digestOpens: 0 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }
function booleanValue(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function numberValue(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function parsePreferences(root: Prisma.JsonValue | null): NotificationAttentionPreferences {
  if (!isRecord(root) || !isRecord(root[PREFERENCE_KEY])) return structuredClone(DEFAULT_PREFERENCES);
  const raw = root[PREFERENCE_KEY];
  const quiet = isRecord(raw.quietHours) ? raw.quietHours : {};
  const digest = isRecord(raw.digest) ? raw.digest : {};
  const channels = isRecord(raw.channels) ? raw.channels : {};
  const escalation = isRecord(raw.escalation) ? raw.escalation : {};
  const cadence = digest.cadence === 'OFF' || digest.cadence === 'WEEKLY' ? digest.cadence : 'DAILY';
  return {
    quietHours: { enabled: booleanValue(quiet.enabled, true), start: stringValue(quiet.start, '20:00'), end: stringValue(quiet.end, '08:00'), timezone: stringValue(quiet.timezone, 'Europe/Istanbul') },
    digest: { cadence, hour: numberValue(digest.hour, 9), weekday: numberValue(digest.weekday, 1) },
    channels: { inApp: booleanValue(channels.inApp, true), email: booleanValue(channels.email, false) },
    mutedModules: Array.isArray(raw.mutedModules) ? raw.mutedModules.filter((item): item is string => typeof item === 'string') : [],
    escalation: { enabled: booleanValue(escalation.enabled, false), afterHours: numberValue(escalation.afterHours, 24), targetRoleId: typeof escalation.targetRoleId === 'string' ? escalation.targetRoleId : null },
  };
}

function parseMetrics(root: Prisma.JsonValue | null): AttentionMetrics {
  if (!isRecord(root) || !isRecord(root[PREFERENCE_KEY]) || !isRecord(root[PREFERENCE_KEY].metrics)) return { ...EMPTY_METRICS };
  const raw = root[PREFERENCE_KEY].metrics;
  return { impressions: numberValue(raw.impressions, 0), actions: numberValue(raw.actions, 0), dismissals: numberValue(raw.dismissals, 0), digestOpens: numberValue(raw.digestOpens, 0) };
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toInputJson);
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) result[key] = toInputJson(item);
  return result;
}

function jsonRoot(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (!isRecord(value)) return {};
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) result[key] = toInputJson(item as Prisma.JsonValue);
  return result;
}

function preferenceJson(preferences: NotificationAttentionPreferences, metrics: AttentionMetrics): Prisma.InputJsonObject {
  return {
    quietHours: { ...preferences.quietHours }, digest: { ...preferences.digest }, channels: { ...preferences.channels },
    mutedModules: preferences.mutedModules,
    escalation: { ...preferences.escalation, targetRoleId: preferences.escalation.targetRoleId },
    metrics: { ...metrics },
  };
}

export class PrismaNotificationAttentionRepository implements NotificationAttentionRepository {
  constructor(private readonly db: PrismaClient) {}

  private async member(tenantId: string, userId: string) {
    return this.db.tenantUser.findFirst({ where: { tenantId, userId, isActive: true }, select: { preferences: true } });
  }

  async isRoleInTenant(tenantId: string, roleId: string): Promise<boolean> {
    return (await this.db.role.count({ where: { id: roleId, tenantId } })) > 0;
  }

  async getPreferences(tenantId: string, userId: string): Promise<NotificationAttentionPreferences> {
    return parsePreferences((await this.member(tenantId, userId))?.preferences ?? null);
  }

  async getMetrics(tenantId: string, userId: string): Promise<AttentionMetrics> {
    return parseMetrics((await this.member(tenantId, userId))?.preferences ?? null);
  }

  async savePreferences(tenantId: string, userId: string, preferences: NotificationAttentionPreferences): Promise<void> {
    const member = await this.member(tenantId, userId);
    if (!member) return;
    const root = jsonRoot(member.preferences);
    await this.db.tenantUser.updateMany({ where: { tenantId, userId, isActive: true }, data: { preferences: { ...root, [PREFERENCE_KEY]: preferenceJson(preferences, parseMetrics(member.preferences)) } } });
  }

  async recordEvent(tenantId: string, userId: string, event: AttentionEventType): Promise<void> {
    const member = await this.member(tenantId, userId);
    if (!member) return;
    const preferences = parsePreferences(member.preferences);
    const current = parseMetrics(member.preferences);
    const key: keyof AttentionMetrics = event === 'IMPRESSION' ? 'impressions' : event === 'ACTION' ? 'actions' : event === 'DISMISS' ? 'dismissals' : 'digestOpens';
    const metrics = { ...current, [key]: current[key] + 1 };
    await this.db.tenantUser.updateMany({ where: { tenantId, userId, isActive: true }, data: { preferences: { ...jsonRoot(member.preferences), [PREFERENCE_KEY]: preferenceJson(preferences, metrics) } } });
  }
}
