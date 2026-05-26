import { PermissionAction, PrismaClient } from '@prisma/client';

export type TenantSecuritySeverity = 'critical' | 'high' | 'medium' | 'low';
export type TenantSecurityStatus = 'pass' | 'warn' | 'fail';

export interface TenantSecurityFinding {
  key: string;
  severity: TenantSecuritySeverity;
  status: TenantSecurityStatus;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  count: number;
}

export interface TenantSecurityScore {
  score: number;
  status: TenantSecurityStatus;
  generatedAt: string;
  findings: TenantSecurityFinding[];
  metrics: {
    activeUsers: number;
    inactiveUsers: number;
    activeApiKeys: number;
    expiringApiKeys: number;
    staleApiKeys: number;
    riskyRoles: number;
    owners: number;
  };
}

const RISKY_WRITE_ACTIONS = new Set<PermissionAction>([
  PermissionAction.CREATE,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
]);

function buildFinding(input: TenantSecurityFinding): TenantSecurityFinding | null {
  return input.count > 0 || input.status === 'pass' ? input : null;
}

function scorePenalty(finding: TenantSecurityFinding): number {
  if (finding.status === 'pass') return 0;
  if (finding.severity === 'critical') return Math.min(30, finding.count * 10);
  if (finding.severity === 'high') return Math.min(20, finding.count * 6);
  if (finding.severity === 'medium') return Math.min(12, finding.count * 3);
  return Math.min(6, finding.count * 2);
}

function summaryStatus(score: number, findings: readonly TenantSecurityFinding[]): TenantSecurityStatus {
  if (findings.some((finding) => finding.status === 'fail' && finding.severity === 'critical')) return 'fail';
  if (score < 70) return 'fail';
  if (score < 90 || findings.some((finding) => finding.status === 'warn')) return 'warn';
  return 'pass';
}

export async function getTenantSecurityScore(db: PrismaClient, tenantId: string): Promise<TenantSecurityScore> {
  const now = new Date();
  const rotationWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const expiryWindowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    activeUsers,
    inactiveUsers,
    owners,
    activeApiKeys,
    expiringApiKeys,
    staleApiKeys,
    roles,
  ] = await db.$transaction([
    db.tenantUser.count({ where: { tenantId, isActive: true, user: { isActive: true, deletedAt: null } } }),
    db.tenantUser.count({ where: { tenantId, OR: [{ isActive: false }, { user: { isActive: false } }] } }),
    db.tenantUser.count({ where: { tenantId, isActive: true, isOwner: true, user: { isActive: true, deletedAt: null } } }),
    db.apiKey.count({ where: { tenantId, deletedAt: null, isActive: true } }),
    db.apiKey.count({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        expiresAt: { not: null, lte: expiryWindowEnd },
      },
    }),
    db.apiKey.count({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [
          { expiresAt: null, createdAt: { lt: rotationWindowStart } },
          { lastUsedAt: { lt: rotationWindowStart } },
        ],
      },
    }),
    db.role.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        permissions: { select: { module: true, action: true } },
      },
    }),
  ]);

  const riskyRoles = roles.filter((role) => {
    const writeModules = new Set(
      role.permissions
        .filter((permission) => RISKY_WRITE_ACTIONS.has(permission.action))
        .map((permission) => permission.module),
    );
    return writeModules.size >= 6;
  }).length;

  const findings = [
    buildFinding({
      key: 'users.no_owner',
      severity: 'critical',
      status: owners > 0 ? 'pass' : 'fail',
      title: 'Tenant owner kullanicisi',
      description: owners > 0 ? 'Aktif owner kullanici mevcut.' : 'Aktif owner kullanici yok; acil yetki duzeltmesi gerekir.',
      actionLabel: 'Kullanicilari ac',
      href: '/dashboard/settings/users',
      count: owners > 0 ? 0 : 1,
    }),
    buildFinding({
      key: 'users.inactive_memberships',
      severity: 'medium',
      status: inactiveUsers > 0 ? 'warn' : 'pass',
      title: 'Pasif veya devre disi kullanicilar',
      description: inactiveUsers > 0 ? 'Pasif uyelikleri ve kullanicilari duzenli temizleyin.' : 'Pasif kullanici riski bulunmuyor.',
      actionLabel: 'Kullanicilari gozden gecir',
      href: '/dashboard/settings/users',
      count: inactiveUsers,
    }),
    buildFinding({
      key: 'api_keys.rotation',
      severity: 'high',
      status: staleApiKeys > 0 ? 'warn' : 'pass',
      title: 'API key rotasyon riski',
      description: staleApiKeys > 0 ? '90 gunden eski veya uzun suredir kullanilmayan aktif API key var.' : 'API key rotasyon riski gorunmuyor.',
      actionLabel: 'API keyleri ac',
      href: '/dashboard/api-keys',
      count: staleApiKeys,
    }),
    buildFinding({
      key: 'api_keys.expiring',
      severity: 'medium',
      status: expiringApiKeys > 0 ? 'warn' : 'pass',
      title: 'Yakinda suresi dolacak API keyler',
      description: expiringApiKeys > 0 ? '14 gun icinde suresi dolacak API keyler icin rotasyon planlayin.' : 'Yakinda suresi dolacak API key yok.',
      actionLabel: 'API keyleri ac',
      href: '/dashboard/api-keys',
      count: expiringApiKeys,
    }),
    buildFinding({
      key: 'roles.risky_write_access',
      severity: 'high',
      status: riskyRoles > 0 ? 'warn' : 'pass',
      title: 'Genis yazma yetkili roller',
      description: riskyRoles > 0 ? 'Cok sayida modulde yazma yetkisi olan roller least privilege acisindan incelenmeli.' : 'Rol yetkilerinde genis yazma riski gorunmuyor.',
      actionLabel: 'Rolleri ac',
      href: '/dashboard/roles',
      count: riskyRoles,
    }),
  ].filter((finding): finding is TenantSecurityFinding => finding !== null);

  const score = Math.max(0, Math.min(100, 100 - findings.reduce((sum, finding) => sum + scorePenalty(finding), 0)));

  return {
    score,
    status: summaryStatus(score, findings),
    generatedAt: now.toISOString(),
    findings,
    metrics: {
      activeUsers,
      inactiveUsers,
      activeApiKeys,
      expiringApiKeys,
      staleApiKeys,
      riskyRoles,
      owners,
    },
  };
}
