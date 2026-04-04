import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes — no auth required
const PUBLIC_PATHS = ['/', '/login', '/register'];

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.');

  // Read token from cookie (set on login) or skip
  const token = request.cookies.get('axon_token')?.value;

  // Unauthenticated → redirect to login
  if (!isPublic && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated → redirect away from auth pages
  if (token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png).*)',
  ],
};
