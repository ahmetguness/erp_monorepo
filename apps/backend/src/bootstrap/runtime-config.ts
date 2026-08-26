export type AppRole = 'api' | 'worker' | 'all';

export interface RuntimeConfig {
  port: number;
  isProduction: boolean;
  role: AppRole;
  allowedOrigins: readonly string[];
}

function parseAppRole(value: string | undefined): AppRole {
  return value === 'worker' || value === 'all' ? value : 'api';
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: Number(env.PORT) || 3001,
    isProduction: env.NODE_ENV === 'production',
    role: parseAppRole(env.APP_ROLE),
    allowedOrigins: (env.ALLOWED_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
