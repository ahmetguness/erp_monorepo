import { describe, expect, it } from 'vitest';
import { validateDeploymentEnv } from '../../../src/config/deployment-env.js';

const valid: NodeJS.ProcessEnv = {
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'production', APP_ROLE: 'api',
  APP_URL: 'https://staging.example.com', ALLOWED_ORIGINS: 'https://staging.example.com',
  DATABASE_URL: 'postgresql://user:password@db/axon?connection_limit=5&pool_timeout=10',
  JWT_SECRET: 'a'.repeat(40), ADMIN_JWT_SECRET: 'b'.repeat(40), ENCRYPTION_KEY: 'c'.repeat(32), API_KEY_PEPPER: 'd'.repeat(40),
  STORAGE_DRIVER: 's3', MALWARE_SCAN_MODE: 'enforce', MALWARE_SCAN_ENDPOINT: 'http://scanner:3000/scan',
  RELEASE_VERSION: '1.0.0', RELEASE_GIT_SHA: 'a'.repeat(40),
  RELEASE_MIGRATION_VERSION: '20261116120000_domain_event_consumer_receipts',
};
describe('deployed environment policy', () => {
  it('accepts bounded pools, HTTPS origins, separate secrets and object storage', () => {
    expect(validateDeploymentEnv(valid)).toEqual([]);
  });
  it.each([
    { APP_URL: 'http://staging.example.com' },
    { STORAGE_DRIVER: 'local', ALLOW_LOCAL_UPLOADS_IN_PRODUCTION: 'true' },
    { STORAGE_LEGACY_LOCAL_READ: 'true' },
    { JWT_SECRET: 'REPLACE_WITH_A_SECRET_AT_LEAST_32_CHARS' },
    { ADMIN_JWT_SECRET: valid.JWT_SECRET },
    { DATABASE_URL: 'postgresql://user:password@db/axon' },
    { DATABASE_URL: 'postgresql://user:password@db/axon?connection_limit=100&pool_timeout=10' },
    { DATABASE_URL: 'postgresql://user:password@db/axon?connection_limit=5&pool_timeout=invalid' },
    { DATABASE_URL: 'postgresql://user:password@db/axon?connection_limit=5&pool_timeout=1.5' },
    { RELEASE_GIT_SHA: 'main' },
    { MOCK_MAIL: 'true' },
    { S3_ENDPOINT: 'http://storage:9000' },
    { MALWARE_SCAN_MODE: 'disabled' },
  ])('rejects an unsafe deployed configuration: %j', (override) => {
    expect(validateDeploymentEnv({ ...valid, ...override }).length).toBeGreaterThan(0);
  });
});
