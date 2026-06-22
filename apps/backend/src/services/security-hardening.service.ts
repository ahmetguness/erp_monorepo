import { randomUUID } from 'crypto';
import { AuditAction, EntityType, PermissionAction, Prisma, PrismaClient } from '@prisma/client';
import { createAuditLog } from '../utils/audit.js';

export type SecuritySessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type SecurityRiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface RequestSecurityMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SecuritySession {
  id: string;
  userId: string;
  tenantId: string;
  status: SecuritySessionStatus;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string;
}

export interface WeakPermissionRisk {
  roleId: string;
  roleName: string;
  severity: SecurityRiskSeverity;
  reason: string;
  permissionCount: number;
  riskyPermissions: Array<{ module: string; action: PermissionAction }>;
  assignedUserCount: number;
}

export interface ApiKeyRotationRisk {
  id: string;
  name: string;
  keyPrefix: string;
  severity: SecurityRiskSeverity;
  reason: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface PublicEndpointAbuseMetric {
  pathGroup: 'public' | 'admin' | 'api';
  ipAddress: string;
  exceededCount: number;
  lastExceededAt: string;
}

export interface WebhookSecurityAudit {
  missingSecretCount: number;
  failedWebhookCount: number;
  replayableWebhookCount: number;
  duplicateWindowCount: number;
  lastFailureAt: string | null;
}

export interface SecurityHardeningSnapshot {
  generatedAt: string;
  sessions: {
    active: number;
    revoked: number;
    expired: number;
    recent: SecuritySession[];
  };
  apiKeyRotation: ApiKeyRotationRisk[];
  weakPermissionRisks: WeakPermissionRisk[];
  publicEndpointAbuse: PublicEndpointAbuseMetric[];
  webhookAudit: WebhookSecurityAudit;
}

const SESSION_SETTING_KEY = 'security.sessions';
const MAX_STORED_SESSIONS = 100;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const API_KEY_ROTATION_MS = 90 * 24 * 60 * 60 * 1000;
const API_KEY_EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;
const PUBLIC_ABUSE_MAX_ENTRIES = 100;

const RISKY_ACTIONS = new Set<PermissionAction>([
  PermissionAction.DELETE,
  PermissionAction.EXPORT,
  PermissionAction.APPROVE,
]);

const publicEndpointAbuseStore = new Map<string, PublicEndpointAbuseMetric>();

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Bilinmeyen cihaz';
  if (userAgent.includes('Edg/')) return 'Microsoft Edge';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/')) return 'Safari';
  return userAgent.slice(0, 80);
}

function isSecuritySession(value: unknown): value is SecuritySession {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.tenantId === 'string' &&
    (value.status === 'ACTIVE' || value.status === 'REVOKED' || value.status === 'EXPIRED') &&
    typeof value.createdAt === 'string' &&
    typeof value.lastSeenAt === 'string' &&
    (typeof value.revokedAt === 'string' || value.revokedAt === null) &&
    (typeof value.revokedById === 'string' || value.revokedById === null) &&
    (typeof value.ipAddress === 'string' || value.ipAddress === null) &&
    (typeof value.userAgent === 'string' || value.userAgent === null) &&
    typeof value.deviceLabel === 'string';
}

function parseSessions(value: string | null | undefined): SecuritySession[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isSecuritySession) : [];
  } catch {
    return [];
  }
}

function serializeSessions(sessions: readonly SecuritySession[]): string {
  return JSON.stringify(sessions.slice(0, MAX_STORED_SESSIONS));
}

function sessionToJson(session: SecuritySession): Prisma.InputJsonObject {
  return {
    id: session.id,
    userId: session.userId,
    tenantId: session.tenantId,
    status: session.status,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    revokedAt: session.revokedAt,
    revokedById: session.revokedById,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    deviceLabel: session.deviceLabel,
  };
}

function withExpiredStatus(session: SecuritySession, now = new Date()): SecuritySession {
  if (session.status !== 'ACTIVE') return session;
  const lastSeenAt = new Date(session.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenAt) || now.getTime() - lastSeenAt <= SESSION_TTL_MS) return session;
  return { ...session, status: 'EXPIRED' };
}

async function readSessions(db: PrismaClient, tenantId: string): Promise<SecuritySession[]> {
  const setting = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: SESSION_SETTING_KEY } },
    select: { value: true },
  });
  return parseSessions(setting?.value).map((session) => withExpiredStatus(session));
}

async function writeSessions(db: PrismaClient, tenantId: string, sessions: readonly SecuritySession[]): Promise<void> {
  await db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: SESSION_SETTING_KEY } },
    create: { tenantId, key: SESSION_SETTING_KEY, value: serializeSessions(sessions) },
    update: { value: serializeSessions(sessions) },
  });
}

export async function createSecuritySession(
  db: PrismaClient,
  tenantId: string,
  userId: string,
  meta: RequestSecurityMeta,
): Promise<SecuritySession> {
  const createdAt = nowIso();
  const session: SecuritySession = {
    id: randomUUID(),
    userId,
    tenantId,
    status: 'ACTIVE',
    createdAt,
    lastSeenAt: createdAt,
    revokedAt: null,
    revokedById: null,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    deviceLabel: toDeviceLabel(meta.userAgent),
  };

  const sessions = await readSessions(db, tenantId);
  await writeSessions(db, tenantId, [session, ...sessions.filter((item) => item.id !== session.id)]);

  await createAuditLog(db, {
    tenantId,
    userId,
    module: 'security',
    entityType: EntityType.OTHER,
    entityId: session.id,
    action: AuditAction.CREATE,
    newValues: sessionToJson(session),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return session;
}

export async function touchSecuritySession(
  db: PrismaClient,
  tenantId: string,
  sessionId: string,
): Promise<SecuritySessionStatus | null> {
  const sessions = await readSessions(db, tenantId);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return null;
  if (session.status !== 'ACTIVE') return session.status;

  const lastSeenAt = new Date(session.lastSeenAt).getTime();
  if (Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt < SESSION_TOUCH_INTERVAL_MS) {
    return 'ACTIVE';
  }

  const updated = { ...session, lastSeenAt: nowIso() };
  await writeSessions(db, tenantId, sessions.map((item) => (item.id === sessionId ? updated : item)));
  return 'ACTIVE';
}

export async function revokeSecuritySession(
  db: PrismaClient,
  tenantId: string,
  sessionId: string,
  revokedById: string,
  meta: RequestSecurityMeta,
): Promise<SecuritySession | null> {
  const sessions = await readSessions(db, tenantId);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return null;

  const revoked: SecuritySession = {
    ...session,
    status: 'REVOKED',
    revokedAt: nowIso(),
    revokedById,
  };
  await writeSessions(db, tenantId, sessions.map((item) => (item.id === sessionId ? revoked : item)));

  await createAuditLog(db, {
    tenantId,
    userId: revokedById,
    module: 'security',
    entityType: EntityType.OTHER,
    entityId: sessionId,
    action: AuditAction.UPDATE,
    oldValues: sessionToJson(session),
    newValues: sessionToJson(revoked),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return revoked;
}

export function recordPublicEndpointAbuse(pathGroup: PublicEndpointAbuseMetric['pathGroup'], ipAddress: string): void {
  const key = `${pathGroup}:${ipAddress}`;
  const current = publicEndpointAbuseStore.get(key);
  const updated: PublicEndpointAbuseMetric = {
    pathGroup,
    ipAddress,
    exceededCount: (current?.exceededCount ?? 0) + 1,
    lastExceededAt: nowIso(),
  };
  publicEndpointAbuseStore.set(key, updated);

  if (publicEndpointAbuseStore.size > PUBLIC_ABUSE_MAX_ENTRIES) {
    const oldest = [...publicEndpointAbuseStore.entries()]
      .sort((left, right) => left[1].lastExceededAt.localeCompare(right[1].lastExceededAt))[0];
    if (oldest) publicEndpointAbuseStore.delete(oldest[0]);
  }
}

function listPublicEndpointAbuse(): PublicEndpointAbuseMetric[] {
  return [...publicEndpointAbuseStore.values()]
    .sort((left, right) => right.lastExceededAt.localeCompare(left.lastExceededAt))
    .slice(0, 20);
}

function severityForRole(permissionCount: number, riskyCount: number, moduleCount: number): SecurityRiskSeverity {
  if (riskyCount >= 8 || moduleCount >= 10) return 'critical';
  if (riskyCount >= 4 || moduleCount >= 6) return 'high';
  if (permissionCount >= 10) return 'medium';
  return 'low';
}

async function getWeakPermissionRisks(db: PrismaClient, tenantId: string): Promise<WeakPermissionRisk[]> {
  const roles = await db.role.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      permissions: { select: { module: true, action: true } },
      users: { select: { id: true }, where: { isActive: true, user: { isActive: true, deletedAt: null } } },
    },
  });

  return roles
    .map((role) => {
      const riskyPermissions = role.permissions.filter((permission) => RISKY_ACTIONS.has(permission.action));
      const moduleCount = new Set(role.permissions.map((permission) => permission.module)).size;
      const shouldReport = riskyPermissions.length >= 3 || moduleCount >= 6 || role.permissions.length >= 12;
      if (!shouldReport) return null;

      return {
        roleId: role.id,
        roleName: role.name,
        severity: severityForRole(role.permissions.length, riskyPermissions.length, moduleCount),
        reason: `${moduleCount} modulde ${role.permissions.length} izin; ${riskyPermissions.length} kritik aksiyon.`,
        permissionCount: role.permissions.length,
        riskyPermissions,
        assignedUserCount: role.users.length,
      };
    })
    .filter((risk): risk is WeakPermissionRisk => risk !== null)
    .sort((left, right) => right.permissionCount - left.permissionCount);
}

function toApiKeyRotationRisk(input: {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}, now: Date): ApiKeyRotationRisk | null {
  const createdAgeMs = now.getTime() - input.createdAt.getTime();
  const lastUsedAgeMs = input.lastUsedAt ? now.getTime() - input.lastUsedAt.getTime() : createdAgeMs;
  const expiresInMs = input.expiresAt ? input.expiresAt.getTime() - now.getTime() : null;

  if (expiresInMs !== null && expiresInMs <= API_KEY_EXPIRY_WARNING_MS) {
    return {
      id: input.id,
      name: input.name,
      keyPrefix: input.keyPrefix,
      severity: expiresInMs < 0 ? 'critical' : 'high',
      reason: expiresInMs < 0 ? 'Suresi dolmus aktif API key.' : '14 gun icinde suresi dolacak API key.',
      createdAt: input.createdAt.toISOString(),
      lastUsedAt: input.lastUsedAt?.toISOString() ?? null,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    };
  }

  if (createdAgeMs > API_KEY_ROTATION_MS || lastUsedAgeMs > API_KEY_ROTATION_MS) {
    return {
      id: input.id,
      name: input.name,
      keyPrefix: input.keyPrefix,
      severity: 'medium',
      reason: '90 gunden eski veya uzun suredir kullanilmayan aktif API key.',
      createdAt: input.createdAt.toISOString(),
      lastUsedAt: input.lastUsedAt?.toISOString() ?? null,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    };
  }

  return null;
}

async function getApiKeyRotationRisks(db: PrismaClient, tenantId: string): Promise<ApiKeyRotationRisk[]> {
  const now = new Date();
  const keys = await db.apiKey.findMany({
    where: { tenantId, deletedAt: null, isActive: true },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return keys
    .map((key) => toApiKeyRotationRisk(key, now))
    .filter((risk): risk is ApiKeyRotationRisk => risk !== null);
}

async function getWebhookAudit(db: PrismaClient, tenantId: string): Promise<WebhookSecurityAudit> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [missingSecretCount, failedWebhookCount, replayableWebhookCount, duplicateWindowCount, lastFailure] = await db.$transaction([
    db.marketplaceIntegration.count({
      where: { tenantId, isActive: true, apiSecret: null },
    }),
    db.marketplaceWebhookEvent.count({
      where: { tenantId, errorMessage: { not: null } },
    }),
    db.marketplaceWebhookEvent.count({
      where: { tenantId, errorMessage: { not: null }, processedAt: null },
    }),
    db.marketplaceWebhookEvent.count({
      where: { tenantId, createdAt: { gte: oneDayAgo } },
    }),
    db.marketplaceWebhookEvent.findFirst({
      where: { tenantId, errorMessage: { not: null } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    missingSecretCount,
    failedWebhookCount,
    replayableWebhookCount,
    duplicateWindowCount,
    lastFailureAt: lastFailure?.createdAt.toISOString() ?? null,
  };
}

export async function listSecuritySessions(db: PrismaClient, tenantId: string): Promise<SecuritySession[]> {
  const sessions = await readSessions(db, tenantId);
  await writeSessions(db, tenantId, sessions);
  return sessions.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

export async function getSecurityHardeningSnapshot(db: PrismaClient, tenantId: string): Promise<SecurityHardeningSnapshot> {
  const [sessions, apiKeyRotation, weakPermissionRisks, webhookAudit] = await Promise.all([
    listSecuritySessions(db, tenantId),
    getApiKeyRotationRisks(db, tenantId),
    getWeakPermissionRisks(db, tenantId),
    getWebhookAudit(db, tenantId),
  ]);

  return {
    generatedAt: nowIso(),
    sessions: {
      active: sessions.filter((session) => session.status === 'ACTIVE').length,
      revoked: sessions.filter((session) => session.status === 'REVOKED').length,
      expired: sessions.filter((session) => session.status === 'EXPIRED').length,
      recent: sessions.slice(0, 12),
    },
    apiKeyRotation,
    weakPermissionRisks,
    publicEndpointAbuse: listPublicEndpointAbuse(),
    webhookAudit,
  };
}
