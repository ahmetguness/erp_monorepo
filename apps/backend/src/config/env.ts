export type EnvRuntime = 'all' | 'development' | 'test' | 'production';
export type EnvValueKind = 'string' | 'number' | 'boolean' | 'url' | 'csv';
export type EnvSecretClass = 'secret' | 'sensitive' | 'public' | 'internal';
export type RuntimeConfigStatus = 'ok' | 'warn' | 'error' | 'disabled';

export interface EnvVarDefinition {
  name: string;
  kind: EnvValueKind;
  required: boolean;
  requiredInProduction?: boolean;
  runtime: EnvRuntime;
  defaultValue?: string;
  secretClass: EnvSecretClass;
  securityNote: string;
  legacyAliasFor?: string;
}

export interface EnvValidationIssue {
  name: string;
  severity: 'error' | 'warn';
  message: string;
}

export interface RuntimeConfigCheck {
  key: string;
  label: string;
  status: RuntimeConfigStatus;
  message: string;
  details: string[];
}

const MARKETPLACE_MOCK_CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'amazon', 'ciceksepeti'] as const;

export const ENV_REGISTRY: readonly EnvVarDefinition[] = [
  { name: 'DATABASE_URL', kind: 'url', required: true, runtime: 'all', secretClass: 'secret', securityNote: 'Database credentials; never expose in logs or client bundles.' },
  { name: 'PORT', kind: 'number', required: false, runtime: 'all', defaultValue: '3001', secretClass: 'internal', securityNote: 'Runtime port only.' },
  { name: 'NODE_ENV', kind: 'string', required: false, runtime: 'all', defaultValue: 'development', secretClass: 'internal', securityNote: 'Controls production-safe defaults.' },
  { name: 'APP_ROLE', kind: 'string', required: false, runtime: 'all', defaultValue: 'api', secretClass: 'internal', securityNote: 'Controls API versus worker process behavior.' },
  { name: 'JWT_SECRET', kind: 'string', required: true, runtime: 'all', secretClass: 'secret', securityNote: 'Tenant JWT signing secret.' },
  { name: 'JWT_EXPIRES_IN', kind: 'string', required: false, runtime: 'all', defaultValue: '7d', secretClass: 'internal', securityNote: 'Token lifetime; not a secret.' },
  { name: 'ADMIN_JWT_SECRET', kind: 'string', required: true, runtime: 'all', secretClass: 'secret', securityNote: 'Admin JWT signing secret.' },
  { name: 'ENCRYPTION_KEY', kind: 'string', required: false, requiredInProduction: true, runtime: 'all', secretClass: 'secret', securityNote: 'Application encryption key for marketplace credentials and other encrypted fields.' },
  { name: 'RESEND_API_KEY', kind: 'string', required: false, runtime: 'all', secretClass: 'secret', securityNote: 'Mail provider API key; optional but required for outbound mail.' },
  { name: 'RESEND_FROM_EMAIL', kind: 'string', required: false, runtime: 'all', defaultValue: 'Axon ERP <noreply@axonerp.com>', secretClass: 'internal', securityNote: 'Mail sender identity; not a secret.' },
  { name: 'APP_URL', kind: 'url', required: false, runtime: 'all', defaultValue: 'http://localhost:3000', secretClass: 'public', securityNote: 'Public web origin used in links.' },
  { name: 'SALES_NOTIFICATION_EMAIL', kind: 'string', required: false, runtime: 'all', secretClass: 'sensitive', securityNote: 'Operational notification recipient.' },
  { name: 'ALLOWED_ORIGINS', kind: 'csv', required: false, requiredInProduction: true, runtime: 'all', defaultValue: 'http://localhost:3000', secretClass: 'internal', securityNote: 'CORS allow-list; production should contain only approved origins.' },
  { name: 'OPENAI_API_KEY', kind: 'string', required: false, runtime: 'all', secretClass: 'secret', securityNote: 'Optional AI provider key; absence disables AI chat features.' },
  { name: 'PUBLIC_CHAT_SESSION_DAILY_LIMIT', kind: 'number', required: false, runtime: 'all', defaultValue: '30', secretClass: 'internal', securityNote: 'Public chat abuse control.' },
  { name: 'PUBLIC_CHAT_DAILY_REQUEST_BUDGET', kind: 'number', required: false, runtime: 'all', defaultValue: '1000', secretClass: 'internal', securityNote: 'Public chat cost control.' },
  { name: 'STORAGE_DRIVER', kind: 'string', required: false, runtime: 'all', defaultValue: 'local in dev, r2 in production', secretClass: 'internal', securityNote: 'Attachment storage backend selector.' },
  { name: 'R2_ACCOUNT_ID', kind: 'string', required: false, runtime: 'all', secretClass: 'sensitive', securityNote: 'R2 account identifier; needed when R2 storage is active.' },
  { name: 'R2_ACCESS_KEY_ID', kind: 'string', required: false, runtime: 'all', secretClass: 'secret', securityNote: 'R2 access key id; needed when R2 storage is active.' },
  { name: 'R2_SECRET_ACCESS_KEY', kind: 'string', required: false, runtime: 'all', secretClass: 'secret', securityNote: 'R2 secret access key; needed when R2 storage is active.' },
  { name: 'R2_BUCKET', kind: 'string', required: false, runtime: 'all', secretClass: 'sensitive', securityNote: 'R2 bucket name; needed when R2 storage is active.' },
  { name: 'R2_ENDPOINT', kind: 'url', required: false, runtime: 'all', defaultValue: 'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com', secretClass: 'sensitive', securityNote: 'R2 endpoint; may reveal account identifier.' },
  { name: 'ALLOW_LOCAL_UPLOADS_IN_PRODUCTION', kind: 'boolean', required: false, runtime: 'production', defaultValue: 'false', secretClass: 'internal', securityNote: 'Exception switch for production local upload fallback.' },
  { name: 'MARKETPLACE_MOCK', kind: 'csv', required: false, runtime: 'development', secretClass: 'internal', securityNote: 'Canonical marketplace mock selector.' },
  { name: 'TRENDYOL_MOCK', kind: 'boolean', required: false, runtime: 'development', secretClass: 'internal', legacyAliasFor: 'MARKETPLACE_MOCK', securityNote: 'Legacy alias; prefer MARKETPLACE_MOCK=trendyol.' },
  { name: 'REDIS_URL', kind: 'url', required: false, requiredInProduction: true, runtime: 'all', secretClass: 'secret', securityNote: 'Redis connection string for production-safe rate limiting and multi-process coordination.' },
  { name: 'GLOBAL_RATE_LIMIT_PER_MINUTE', kind: 'number', required: false, runtime: 'all', defaultValue: '300', secretClass: 'internal', securityNote: 'Global public API rate limit.' },
  { name: 'GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE', kind: 'number', required: false, runtime: 'all', defaultValue: '120', secretClass: 'internal', securityNote: 'Global write API rate limit.' },
  { name: 'MARKETPLACE_WORKER_ENABLED', kind: 'boolean', required: false, runtime: 'all', secretClass: 'internal', securityNote: 'Explicit marketplace worker switch.' },
  { name: 'DOMAIN_EVENT_OUTBOX_WORKER_ENABLED', kind: 'boolean', required: false, runtime: 'all', secretClass: 'internal', securityNote: 'Explicit domain event worker switch.' },
  { name: 'DOMAIN_EVENT_OUTBOX_WORKER_INTERVAL_MS', kind: 'number', required: false, runtime: 'all', defaultValue: '10000', secretClass: 'internal', securityNote: 'Domain event worker polling interval.' },
  { name: 'DOMAIN_EVENT_OUTBOX_PROCESSING_TIMEOUT_MS', kind: 'number', required: false, runtime: 'all', secretClass: 'internal', securityNote: 'Domain event processing timeout override.' },
  { name: 'WORKER_CONCURRENCY', kind: 'number', required: false, runtime: 'all', defaultValue: '2', secretClass: 'internal', securityNote: 'Background worker concurrency.' },
  { name: 'EXTERNAL_API_KEY_RATE_LIMIT_PER_MINUTE', kind: 'number', required: false, runtime: 'all', secretClass: 'internal', securityNote: 'External API key per-minute rate limit override.' },
  { name: 'PRISMA_QUERY_LOG', kind: 'boolean', required: false, runtime: 'all', defaultValue: 'false', secretClass: 'internal', securityNote: 'Enables verbose Prisma query logs; keep disabled in normal production.' },
  { name: 'SENTRY_DSN', kind: 'url', required: false, runtime: 'production', secretClass: 'sensitive', securityNote: 'Optional error telemetry DSN.' },
  { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', kind: 'url', required: false, runtime: 'production', secretClass: 'sensitive', securityNote: 'Optional OpenTelemetry endpoint.' },
  { name: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', kind: 'url', required: false, runtime: 'production', secretClass: 'sensitive', securityNote: 'Optional OpenTelemetry traces endpoint.' },
] as const;

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function validateKind(definition: EnvVarDefinition, value: string): string | null {
  if (definition.kind === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? null : 'must be a non-negative number';
  }
  if (definition.kind === 'boolean') {
    return value === 'true' || value === 'false' ? null : 'must be true or false';
  }
  if (definition.kind === 'url') {
    try {
      new URL(value);
      return null;
    } catch {
      return 'must be a valid URL';
    }
  }
  return null;
}

function isRequired(definition: EnvVarDefinition): boolean {
  return definition.required || (definition.requiredInProduction === true && isProductionEnv());
}

function shouldValidateInRuntime(definition: EnvVarDefinition): boolean {
  return definition.runtime === 'all' || definition.runtime === process.env.NODE_ENV;
}

export function validateEnvRegistry(): EnvValidationIssue[] {
  const issues: EnvValidationIssue[] = [];

  for (const definition of ENV_REGISTRY) {
    if (!shouldValidateInRuntime(definition)) continue;

    const value = readEnv(definition.name);
    if (!value) {
      if (isRequired(definition)) {
        issues.push({
          name: definition.name,
          severity: 'error',
          message: `${definition.name} is required for this runtime.`,
        });
      }
      continue;
    }

    const kindIssue = validateKind(definition, value);
    if (kindIssue) {
      issues.push({ name: definition.name, severity: 'error', message: `${definition.name} ${kindIssue}.` });
    }
  }

  if (isProductionEnv() && readEnv('TRENDYOL_MOCK') === 'true') {
    issues.push({ name: 'TRENDYOL_MOCK', severity: 'error', message: 'TRENDYOL_MOCK must not be enabled in production.' });
  }

  const marketplaceMock = readEnv('MARKETPLACE_MOCK');
  if (isProductionEnv() && marketplaceMock) {
    issues.push({ name: 'MARKETPLACE_MOCK', severity: 'error', message: 'MARKETPLACE_MOCK must not be enabled in production.' });
  }

  const storageDriver = readEnv('STORAGE_DRIVER')?.toLowerCase();
  const r2Active = storageDriver === 'r2' || (isProductionEnv() && storageDriver !== 'local');
  if (r2Active) {
    for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      if (!isPresent(name)) {
        issues.push({ name, severity: 'error', message: `${name} is required when R2 storage is active.` });
      }
    }
  }

  return issues;
}

export function assertValidStartupEnv(): void {
  const errors = validateEnvRegistry().filter((issue) => issue.severity === 'error');
  if (errors.length === 0) return;

  throw new Error(`Runtime env validation failed: ${errors.map((issue) => issue.message).join(' ')}`);
}

function readConfiguredMarketplaceMockChannels(): readonly string[] {
  const marketplaceMock = readEnv('MARKETPLACE_MOCK')?.toLowerCase();
  if (marketplaceMock) {
    if (marketplaceMock === 'all') return MARKETPLACE_MOCK_CHANNELS;
    return marketplaceMock.split(',').map((channel) => channel.trim()).filter(Boolean);
  }

  if (readEnv('TRENDYOL_MOCK') === 'true') return ['trendyol'];
  return [];
}

export function getMarketplaceMockChannels(): readonly string[] {
  const configuredChannels = readConfiguredMarketplaceMockChannels();
  if (configuredChannels.length > 0) return configuredChannels;
  if (!isProductionEnv()) return ['trendyol'];
  return [];
}

export function isMarketplaceMockChannelEnabled(channel: string): boolean {
  return readConfiguredMarketplaceMockChannels().some((enabledChannel) => enabledChannel === 'all' || enabledChannel === channel.toLowerCase());
}

export function getRuntimeConfigChecks(): RuntimeConfigCheck[] {
  const storageDriver = readEnv('STORAGE_DRIVER')?.toLowerCase() ?? (isProductionEnv() ? 'r2' : 'local');
  const r2Missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((name) => !isPresent(name));
  const marketplaceChannels = getMarketplaceMockChannels();

  return [
    {
      key: 'integration:openai',
      label: 'OpenAI',
      status: isPresent('OPENAI_API_KEY') ? 'ok' : 'disabled',
      message: isPresent('OPENAI_API_KEY') ? 'AI chat features are configured.' : 'AI chat features are disabled because OPENAI_API_KEY is not set.',
      details: ['secretValue=redacted'],
    },
    {
      key: 'integration:mail',
      label: 'Mail/Resend',
      status: isPresent('RESEND_API_KEY') ? 'ok' : 'disabled',
      message: isPresent('RESEND_API_KEY') ? 'Outbound mail provider is configured.' : 'Outbound mail is disabled because RESEND_API_KEY is not set.',
      details: [`from=${readEnv('RESEND_FROM_EMAIL') ?? 'Axon ERP <noreply@axonerp.com>'}`],
    },
    {
      key: 'integration:redis',
      label: 'Redis',
      status: isPresent('REDIS_URL') ? 'ok' : isProductionEnv() ? 'error' : 'disabled',
      message: isPresent('REDIS_URL')
        ? 'Redis-backed rate limiting is configured.'
        : isProductionEnv()
          ? 'REDIS_URL is required in production for multi-process rate limiting.'
          : 'Redis is disabled; development uses in-memory fallbacks.',
      details: ['connectionString=redacted'],
    },
    {
      key: 'integration:r2',
      label: 'R2 object storage',
      status: storageDriver === 'r2' ? r2Missing.length === 0 ? 'ok' : 'error' : isProductionEnv() ? 'warn' : 'disabled',
      message: storageDriver === 'r2'
        ? r2Missing.length === 0 ? 'R2 attachment storage is configured.' : 'R2 attachment storage is selected but required env values are missing.'
        : isProductionEnv()
          ? 'Production is using local attachment storage; this should be an explicit exception.'
          : 'Local attachment storage is active for development.',
      details: [`driver=${storageDriver}`, `missing=${r2Missing.join(', ') || 'none'}`],
    },
    {
      key: 'integration:marketplace-mock',
      label: 'Marketplace mock',
      status: marketplaceChannels.length > 0 ? isProductionEnv() ? 'error' : 'warn' : 'ok',
      message: marketplaceChannels.length > 0
        ? `Marketplace mocks enabled for: ${marketplaceChannels.join(', ')}.`
        : 'Marketplace mocks are disabled.',
      details: [
        `MARKETPLACE_MOCK=${readEnv('MARKETPLACE_MOCK') ?? 'unset'}`,
        `TRENDYOL_MOCK=${readEnv('TRENDYOL_MOCK') ?? 'unset'} (legacy alias)`,
      ],
    },
  ];
}

export function getEnvRegistrySnapshot(): EnvVarDefinition[] {
  return ENV_REGISTRY.map((definition) => ({ ...definition }));
}
