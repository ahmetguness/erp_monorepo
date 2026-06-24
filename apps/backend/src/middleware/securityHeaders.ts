import type { MiddlewareHandler } from 'hono';

const COMMON_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-XSS-Protection', '0'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
];

const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

function readAllowedConnectSources(): string[] {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .flatMap((origin) => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
          ? [parsed.origin]
          : [];
      } catch {
        return [];
      }
    });
}

function buildContentSecurityPolicyReportOnly(): string {
  const connectSources = ["'self'", ...readAllowedConnectSources()];
  const directives: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']],
    ['font-src', ["'self'", 'https://fonts.gstatic.com']],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['connect-src', connectSources],
    ['frame-ancestors', ["'none'"]],
  ];

  return directives
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } finally {
    for (const [name, value] of COMMON_SECURITY_HEADERS) {
      c.header(name, value);
    }

    c.header('Content-Security-Policy-Report-Only', buildContentSecurityPolicyReportOnly());

    if (process.env.NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
    }
  }
};
