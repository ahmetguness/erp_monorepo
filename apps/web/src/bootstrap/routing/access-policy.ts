export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/', '/login', '/register', '/admin/login', '/set-password', '/invite', '/api-docs',
]);

export type RouteAccessDecision =
  | { type: 'allow' }
  | { type: 'login'; returnTo: string }
  | { type: 'dashboard' };

export interface RouteAccessInput {
  pathname: string;
  search: string;
  hasToken: boolean;
  hasReturnTarget: boolean;
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname)
    || pathname.startsWith('/_next')
    || pathname.startsWith('/api')
    || pathname.includes('.');
}

export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  if (input.pathname.startsWith('/admin')) return { type: 'allow' };
  if (!isPublicPath(input.pathname) && !input.hasToken) {
    return { type: 'login', returnTo: `${input.pathname}${input.search}` };
  }
  if (input.hasToken && (input.pathname === '/login' || input.pathname === '/register') && !input.hasReturnTarget) {
    return { type: 'dashboard' };
  }
  return { type: 'allow' };
}
