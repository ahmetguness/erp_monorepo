import type { EnvValidationIssue } from './env-validation.js';

export function validateDeploymentEnv(env: NodeJS.ProcessEnv): EnvValidationIssue[] {
  if (!['staging', 'production'].includes(env.DEPLOYMENT_ENV ?? '')) return [];
  const issues: EnvValidationIssue[] = [];
  const fail = (name: string, message: string) => issues.push({ name, severity: 'error', message: `${name} ${message}` });
  for (const key of ['JWT_SECRET', 'ADMIN_JWT_SECRET', 'ENCRYPTION_KEY', 'API_KEY_PEPPER']) {
    if ((env[key]?.length ?? 0) < 32 || /replace|change[_-]?me|your[-_]/i.test(env[key] ?? '')) fail(key, 'must contain at least 32 characters from a configured secret.');
  }
  if (env.JWT_SECRET === env.ADMIN_JWT_SECRET) fail('ADMIN_JWT_SECRET', 'must differ from the tenant signing secret.');
  if (!['api', 'worker'].includes(env.APP_ROLE ?? '')) fail('APP_ROLE', 'must be api or worker.');
  if (env.NODE_ENV !== 'production') fail('NODE_ENV', 'must be production for deployed environments.');
  for (const key of ['APP_URL', 'ALLOWED_ORIGINS']) {
    for (const value of (env[key] ?? '').split(',')) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.origin !== value.replace(/\/$/, '')) throw new Error();
      } catch { fail(key, 'must contain explicit HTTPS origins.'); }
    }
  }
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    const limit = Number(url.searchParams.get('connection_limit'));
    const timeout = Number(url.searchParams.get('pool_timeout'));
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(timeout) || timeout < 1 || timeout > 30) throw new Error();
  } catch { fail('DATABASE_URL', 'requires PostgreSQL, connection_limit=1..20 and pool_timeout=1..30.'); }
  if (!['s3', 'r2'].includes(env.STORAGE_DRIVER ?? '') || env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION === 'true' || env.STORAGE_LEGACY_LOCAL_READ === 'true') {
    fail('STORAGE_DRIVER', 'must use object storage without a local fallback.');
  }
  for (const key of ['S3_ENDPOINT', 'R2_ENDPOINT']) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    } catch { fail(key, 'must use HTTPS without embedded credentials.'); }
  }
  if (env.MOCK_MAIL === 'true' || env.EDOCUMENT_PROVIDER_MODE === 'mock') fail('DEPLOYMENT_ENV', 'must not enable mock delivery providers.');
  if (env.MALWARE_SCAN_MODE !== 'enforce' || !env.MALWARE_SCAN_ENDPOINT) fail('MALWARE_SCAN_MODE', 'requires an enforcing scanner.');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(env.RELEASE_VERSION ?? '')) fail('RELEASE_VERSION', 'must be SemVer.');
  if (!/^[a-f0-9]{40}$/.test(env.RELEASE_GIT_SHA ?? '')) fail('RELEASE_GIT_SHA', 'must be a full commit SHA.');
  if (!/^\d{14}_[a-zA-Z0-9_]+$/.test(env.RELEASE_MIGRATION_VERSION ?? '')) fail('RELEASE_MIGRATION_VERSION', 'must identify the required schema migration.');
  return issues;
}
