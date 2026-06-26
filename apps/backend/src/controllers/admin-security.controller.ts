import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { getStorageStatus } from '../services/storage.service.js';
import {
  ENV_REGISTRY,
  getRuntimeConfigChecks,
  validateEnvRegistry,
  type RuntimeConfigStatus,
} from '../config/env.js';

type SecurityStatus = 'pass' | 'warn' | 'fail';

interface SecurityCheck {
  key: string;
  label: string;
  status: SecurityStatus;
  message: string;
  details?: string[];
}

type HealthCheckStatus = 'ok' | 'error' | 'disabled';

async function databaseHealthStatus(): Promise<HealthCheckStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}

function toSecurityStatus(status: RuntimeConfigStatus): SecurityStatus {
  switch (status) {
    case 'ok':
      return 'pass';
    case 'error':
      return 'fail';
    case 'warn':
    case 'disabled':
      return 'warn';
  }
}

function envRegistryCheck(): SecurityCheck {
  const issues = validateEnvRegistry();
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warn');
  return {
    key: 'env:registry',
    label: 'Env registry',
    status: errors.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
    message: errors.length > 0
      ? `${errors.length} runtime env validation hatasi var.`
      : warnings.length > 0
        ? `${warnings.length} runtime env uyarisi var.`
        : `${ENV_REGISTRY.length} env degiskeni merkezi registry ile izlendi.`,
    details: issues.length > 0
      ? issues.map((issue) => `${issue.name}: ${issue.message}`)
      : ['secret values are never returned', 'public values are marked as public'],
  };
}

function publicEnvCheck(): SecurityCheck {
  const publicEntries = ENV_REGISTRY.filter((entry) => entry.secretClass === 'public');
  return {
    key: 'env:public-safety',
    label: 'Public env safety',
    status: 'pass',
    message: 'Public env degerleri secret degildir; NEXT_PUBLIC_* degerleri browser bundle icinde gorunur.',
    details: [
      ...publicEntries.map((entry) => `${entry.name}: ${entry.securityNote}`),
      'NEXT_PUBLIC_API_URL and NEXT_PUBLIC_N8N_PUBLIC_WEBHOOK_URL must never contain tokens or credentials.',
    ],
  };
}

function runtimeConfigChecks(): SecurityCheck[] {
  return getRuntimeConfigChecks().map((check) => ({
    key: check.key,
    label: check.label,
    status: toSecurityStatus(check.status),
    message: check.message,
    details: check.details,
  }));
}

function checkEnv(name: string, requiredInProduction = true): SecurityCheck {
  const present = Boolean(process.env[name]);
  const isProduction = process.env.NODE_ENV === 'production';
  const required = requiredInProduction && isProduction;
  return {
    key: `env:${name}`,
    label: `${name} env`,
    status: present ? 'pass' : required ? 'fail' : 'warn',
    message: present ? 'Tanımlı.' : required ? 'Production için zorunlu ama eksik.' : 'Tanımlı değil.',
  };
}

function databasePoolCheck(): SecurityCheck {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    return { key: 'db:pool', label: 'DB pool', status: 'fail', message: 'DATABASE_URL eksik.' };
  }

  try {
    const url = new URL(rawUrl);
    const connectionLimit = url.searchParams.get('connection_limit');
    const poolTimeout = url.searchParams.get('pool_timeout');
    const pgbouncer = url.searchParams.get('pgbouncer');
    const hasPoolConfig = Boolean(connectionLimit || poolTimeout || pgbouncer === 'true');
    return {
      key: 'db:pool',
      label: 'DB pool',
      status: hasPoolConfig ? 'pass' : 'warn',
      message: hasPoolConfig ? 'Pool parametreleri tanımlı.' : 'DATABASE_URL içinde pool parametresi görünmüyor.',
      details: [
        `connection_limit=${connectionLimit ?? 'unset'}`,
        `pool_timeout=${poolTimeout ?? 'unset'}`,
        `pgbouncer=${pgbouncer ?? 'unset'}`,
      ],
    };
  } catch {
    return { key: 'db:pool', label: 'DB pool', status: 'warn', message: 'DATABASE_URL parse edilemedi.' };
  }
}

function workerCheck(): SecurityCheck {
  const appRole = process.env.APP_ROLE ?? 'api';
  const enabled = process.env.MARKETPLACE_WORKER_ENABLED;
  const workerExplicit = enabled === 'true' || enabled === 'false' || appRole === 'worker' || appRole === 'all';
  return {
    key: 'worker:marketplace',
    label: 'Marketplace worker',
    status: workerExplicit ? 'pass' : 'warn',
    message: workerExplicit ? 'Worker davranışı env ile açıkça tanımlı.' : 'Worker varsayılan API modunda kapalı; production deploy planını doğrulayın.',
    details: [`APP_ROLE=${appRole}`, `MARKETPLACE_WORKER_ENABLED=${enabled ?? 'unset'}`],
  };
}

function redisCheck(): SecurityCheck {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL;
  return {
    key: 'redis:rate-limit',
    label: 'Redis/rate limit',
    status: redisUrl ? 'pass' : isProduction ? 'fail' : 'warn',
    message: redisUrl ? 'Redis URL tanımlı.' : isProduction ? 'Production rate limit için REDIS_URL zorunlu.' : 'Dev ortamında in-memory fallback kullanılır.',
  };
}

function storageCheck(): SecurityCheck {
  const status = getStorageStatus();
  if (status.driver === 'r2') {
    return {
      key: 'uploads:storage',
      label: 'Attachment storage',
      status: status.ready ? 'pass' : 'fail',
      message: status.ready ? 'R2 object storage yapılandırılmış.' : 'R2 object storage env değerleri eksik.',
      details: [
        `STORAGE_DRIVER=${status.driver}`,
        `missing=${status.missing.join(', ') || 'none'}`,
      ],
    };
  }

  return {
    key: 'uploads:storage',
    label: 'Attachment storage',
    status: status.productionLocalAllowed ? 'warn' : 'pass',
    message: status.productionLocalAllowed
      ? 'Production local upload açık; R2 object storage önerilir.'
      : 'Local upload yalnızca dev varsayılanı olarak kullanılıyor.',
    details: [`STORAGE_DRIVER=${status.driver}`],
  };
}

export const AdminSecurityController = {
  async runtimeHealth(c: Context): Promise<Response> {
    const checks: Record<string, HealthCheckStatus> = {
      db: await databaseHealthStatus(),
      openai: process.env.OPENAI_API_KEY ? 'ok' : 'disabled',
      mail: process.env.RESEND_API_KEY ? 'ok' : 'disabled',
      redis: process.env.REDIS_URL ? 'ok' : 'disabled',
    };
    const runtimeConfig = getRuntimeConfigChecks();
    const hasError = Object.values(checks).includes('error') || runtimeConfig.some((check) => check.status === 'error');
    const status = hasError ? 'degraded' : 'ok';

    return c.json({ data: { status, checks, runtimeConfig, uptime: process.uptime() } }, hasError ? 503 : 200);
  },

  async checklist(c: Context): Promise<Response> {
    const missingWebhookSecretCount = await prisma.marketplaceIntegration.count({
      where: { channel: 'TRENDYOL', isActive: true, OR: [{ apiSecret: null }, { apiSecret: '' }] },
    });

    const checks: SecurityCheck[] = [
      checkEnv('JWT_SECRET'),
      checkEnv('ADMIN_JWT_SECRET'),
      checkEnv('ENCRYPTION_KEY'),
      checkEnv('ALLOWED_ORIGINS', false),
      envRegistryCheck(),
      publicEnvCheck(),
      ...runtimeConfigChecks(),
      redisCheck(),
      databasePoolCheck(),
      workerCheck(),
      {
        key: 'webhook:trendyol-secret',
        label: 'Webhook secret',
        status: missingWebhookSecretCount === 0 ? 'pass' : 'fail',
        message: missingWebhookSecretCount === 0
          ? 'Aktif Trendyol entegrasyonlarında secret mevcut.'
          : `${missingWebhookSecretCount} aktif Trendyol entegrasyonunda webhook/API secret eksik.`,
      },
      storageCheck(),
    ];

    const hasFail = checks.some((check) => check.status === 'fail');
    const hasWarn = checks.some((check) => check.status === 'warn');
    const summary: SecurityStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

    return c.json({ data: { summary, checks } });
  },
};
