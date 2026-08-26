import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideRouteAccess } from '@/bootstrap/routing/access-policy';

export function proxy(request: NextRequest): NextResponse {
  const decision = decideRouteAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasToken: Boolean(request.cookies.get('axon_token')?.value),
    hasReturnTarget: request.nextUrl.searchParams.has('from'),
  });

  if (decision.type === 'login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', decision.returnTo);
    return NextResponse.redirect(loginUrl);
  }

  if (decision.type === 'dashboard') return NextResponse.redirect(new URL('/dashboard', request.url));

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png).*)',
  ],
};
