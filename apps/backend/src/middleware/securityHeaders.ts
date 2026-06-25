import type { MiddlewareHandler } from 'hono';

type ContentSecurityPolicyMode = 'report-only' | 'enforce' | 'both';

const COMMON_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-XSS-Protection', '0'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
];

const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';
const DEFAULT_CSP_MODE: ContentSecurityPolicyMode = 'both';

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

function readContentSecurityPolicyMode(): ContentSecurityPolicyMode {
  const mode = process.env.CONTENT_SECURITY_POLICY_MODE?.trim().toLowerCase();
  return mode === 'report-only' || mode === 'enforce' || mode === 'both'
    ? mode
    : DEFAULT_CSP_MODE;
}

function buildContentSecurityPolicy(): string {
  const connectSources = ["'self'", ...readAllowedConnectSources()];
  const directives: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']],
    ['font-src', ["'self'", 'https://fonts.gstatic.com']],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['connect-src', connectSources],
    ['form-action', ["'self'"]],
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

    const contentSecurityPolicy = buildContentSecurityPolicy();
    const cspMode = readContentSecurityPolicyMode();
    if (cspMode === 'report-only' || cspMode === 'both') {
      c.header('Content-Security-Policy-Report-Only', contentSecurityPolicy);
    }
    if (cspMode === 'enforce' || cspMode === 'both') {
      c.header('Content-Security-Policy', contentSecurityPolicy);
    }

    if (process.env.NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
    }
  }
};
