const databaseUrl = process.env.CROSS_MODULE_DATABASE_URL;
if (!databaseUrl) throw new Error('CROSS_MODULE_DATABASE_URL must explicitly name an isolated phase3_*_ci database.');
const target = new URL(databaseUrl);
if (!/^phase3_[a-z0-9_]+_ci$/.test(target.pathname.slice(1)) || (target.searchParams.get('schema') ?? 'public') !== 'public') {
  throw new Error('Cross-module assurance only permits phase3_*_ci databases using the public schema.');
}

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'cross-module-test-tenant-secret-32-characters';
process.env.ADMIN_JWT_SECRET = 'cross-module-test-admin-secret-32-characters';
process.env.ALLOWED_ORIGINS = 'http://localhost:3100';
process.env.MARKETPLACE_WORKER_ENABLED = 'false';
process.env.DOMAIN_EVENT_OUTBOX_WORKER_ENABLED = 'false';
process.env.CHAT_ATTACHMENT_WORKER_ENABLED = 'false';
process.env.PERSISTENT_OBSERVABILITY_ENABLED = 'false';
process.env.GLOBAL_RATE_LIMIT_PER_MINUTE = '100000';
process.env.GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE = '100000';
